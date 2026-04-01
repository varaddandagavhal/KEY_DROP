const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { Readable } = require('stream');
const Content = require('../models/Content');
const { getBucket } = require('../config/db');

// Multer: memory storage — we pipe the buffer into GridFS manually
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB — GridFS handles chunking
});

// ── Helper: stream a Buffer into GridFS ──────────────────────────────
function uploadToGridFS(bucket, buffer, filename, mimetype) {
    return new Promise((resolve, reject) => {
        const readable = Readable.from(buffer);
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: mimetype
        });
        readable.pipe(uploadStream)
            .on('finish', () => resolve(uploadStream.id))
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
            contentData.text = text.trim();

        } else {
            if (!req.file) {
                return res.status(400).json({ error: 'file is required' });
            }
            const bucket = getBucket();
            const gridfsId = await uploadToGridFS(
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
        }

        const content = new Content(contentData);
        await content.save();

        return res.status(201).json({
            success: true,
            code,
            type,
            expiresIn: 1440,           // minutes
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
            response.text = content.text;
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
        downloadStream.pipe(res);

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
