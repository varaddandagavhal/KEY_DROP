const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { Readable } = require('stream');
const Content = require('../models/Content');
const { getBucket } = require('../config/db');
const { 
    encryptText, 
    decryptText, 
    createEncryptionStream, 
    createDecryptionStream, 
    IV_LENGTH 
} = require('../utils/encryption');
const crypto = require('crypto');

// Multer: memory storage — we pipe the buffer into GridFS manually
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB — GridFS handles chunking
});

// ── Helper: stream a Buffer into GridFS ──────────────────────────────
// ── Helper: stream a Buffer into GridFS with encryption ─────────────
function uploadEncryptedToGridFS(bucket, buffer, filename, mimetype) {
    return new Promise((resolve, reject) => {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = createEncryptionStream(iv);
        const readable = Readable.from(buffer);
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: mimetype
        });

        readable.pipe(cipher).pipe(uploadStream)
            .on('finish', () => {
                resolve({
                    gridfsId: uploadStream.id,
                    iv: iv.toString('hex'),
                    authTag: cipher.getAuthTag().toString('hex')
                });
            })
            .on('error', reject);
    });
}

// ── Helper: delete a GridFS file by ID ───────────────────────────────
async function deleteFromGridFS(bucket, fileId) {
    try {
        await bucket.delete(new mongoose.Types.ObjectId(fileId));
    } catch (_) { /* ignore if already deleted */ }
}

// ─── POST /api/upload ─────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { type, text } = req.body;

        if (!type || !['text', 'file'].includes(type)) {
            return res.status(400).json({ error: 'type must be "text" or "file"' });
        }

        const code = await Content.generateCode();
        const contentData = { code, type };

        if (type === 'text') {
            if (!text || !text.trim()) {
                return res.status(400).json({ error: 'text field is required' });
            }
            const encrypted = encryptText(text.trim());
            contentData.text = encrypted.encryptedText;
            contentData.iv = encrypted.iv;
            contentData.authTag = encrypted.authTag;

        } else {
            if (!req.file) {
                return res.status(400).json({ error: 'file is required' });
            }
            const bucket = getBucket();
            const { gridfsId, iv, authTag } = await uploadEncryptedToGridFS(
                bucket,
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype
            );
            contentData.filename = req.file.originalname;
            contentData.originalname = req.file.originalname;
            contentData.mimetype = req.file.mimetype;
            contentData.filesize = req.file.size;
            contentData.gridfsId = gridfsId;
            contentData.iv = iv;
            contentData.authTag = authTag;
        }

        const content = new Content(contentData);
        await content.save();

        return res.status(201).json({
            success: true,
            code,
            type,
            expiresIn: 60,           // 60 minutes
            expiresAt: content.expiresAt
        });

    } catch (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── GET /api/retrieve/:code ──────────────────────────────────────────
router.get('/retrieve/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const content = await Content.findOne({ code });

        if (!content) {
            return res.status(404).json({ error: 'Content not found or expired' });
        }
        if (content.expiresAt < new Date()) {
            if (content.gridfsId) await deleteFromGridFS(getBucket(), content.gridfsId);
            await Content.deleteOne({ code });
            return res.status(410).json({ error: 'Content has expired' });
        }

        const response = {
            success: true,
            code: content.code,
            type: content.type,
            createdAt: content.createdAt,
            expiresAt: content.expiresAt,
            downloadCount: content.downloadCount
        };

        if (content.type === 'text') {
            if (!content.iv) {
                // Fallback for old unencrypted data
                response.text = content.text;
            } else {
                try {
                    response.text = decryptText(content.text, content.iv, content.authTag);
                } catch (err) {
                    console.error('Decryption failed:', err);
                    return res.status(500).json({ error: 'Failed to decrypt content' });
                }
            }
        } else {
            response.filename = content.filename;
            response.mimetype = content.mimetype;
            response.filesize = content.filesize;
        }

        return res.status(200).json(response);

    } catch (err) {
        console.error('Retrieve error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── GET /api/download/:code ──────────────────────────────────────────
router.get('/download/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const content = await Content.findOne({ code });

        if (!content || content.type !== 'file') {
            return res.status(404).json({ error: 'File not found or expired' });
        }
        if (content.expiresAt < new Date()) {
            if (content.gridfsId) await deleteFromGridFS(getBucket(), content.gridfsId);
            await Content.deleteOne({ code });
            return res.status(410).json({ error: 'Content has expired' });
        }

        content.downloadCount += 1;
        await content.save();

        res.set({
            'Content-Type': content.mimetype || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(content.originalname)}"`,
            'Content-Length': content.filesize
        });

        const bucket = getBucket();
        const downloadStream = bucket.openDownloadStream(
            new mongoose.Types.ObjectId(content.gridfsId)
        );

        downloadStream.on('error', () => res.status(404).json({ error: 'File data not found' }));

        if (!content.iv) {
            // Fallback for old unencrypted files
            downloadStream.pipe(res);
        } else {
            const decipher = createDecryptionStream(
                Buffer.from(content.iv, 'hex'),
                Buffer.from(content.authTag, 'hex')
            );
            // Pipe: GridFS -> Decryption -> Response
            downloadStream.pipe(decipher).pipe(res);
        }

    } catch (err) {
        console.error('Download error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── GET /api/status/:code ────────────────────────────────────────────
router.get('/status/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const content = await Content.findOne({ code }, { code: 1, type: 1, expiresAt: 1 });
        if (!content || content.expiresAt < new Date()) {
            return res.status(404).json({ active: false });
        }
        return res.status(200).json({ active: true, type: content.type, expiresAt: content.expiresAt });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── DELETE /api/delete/:code ─────────────────────────────────────────
router.delete('/delete/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase().trim();
        const content = await Content.findOne({ code });

        if (!content) {
            return res.status(404).json({ error: 'Content already deleted or not found' });
        }

        if (content.gridfsId) {
            await deleteFromGridFS(getBucket(), content.gridfsId);
        }

        await Content.deleteOne({ code });

        return res.status(200).json({ success: true, message: 'Content deleted successfully' });
    } catch (err) {
        console.error('Delete error:', err);
        return res.status(500).json({ error: 'Failed to delete content' });
    }
});

// ─── DELETE /api/cleanup ──────────────────────────────────────────────
router.delete('/cleanup', async (req, res) => {
    try {
        const expired = await Content.find({ expiresAt: { $lt: new Date() } }, { gridfsId: 1 });
        const bucket = getBucket();
        for (const doc of expired) {
            if (doc.gridfsId) await deleteFromGridFS(bucket, doc.gridfsId);
        }
        const result = await Content.deleteMany({ expiresAt: { $lt: new Date() } });
        return res.status(200).json({ success: true, deleted: result.deletedCount });
    } catch (err) {
        return res.status(500).json({ error: 'Cleanup failed' });
    }
});

module.exports = router;
