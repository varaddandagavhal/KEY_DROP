const mongoose = require('mongoose');

/**
 * Content schema stores metadata for both text and file drops.
 * - Text content is stored directly in the `text` field.
 * - File content is stored in MongoDB GridFS; only the GridFS file ID is stored here.
 * This sidesteps the 16 MB BSON document limit for files.
 */
const contentSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        enum: ['text', 'file'],
        required: true
    },
    // ── Text fields ─────────────────────────────────────────────
    text: {
        type: String,
        default: null
    },
    // ── File metadata (actual data lives in GridFS) ──────────────
    filename: {
        type: String,
        default: null
    },
    originalname: {
        type: String,
        default: null
    },
    mimetype: {
        type: String,
        default: null
    },
    filesize: {
        type: Number,
        default: null
    },
    gridfsId: {           // ObjectId of the GridFS file
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    // ── Metadata ────────────────────────────────────────────────
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 Hour
        index: { expireAfterSeconds: 0 }  // MongoDB TTL auto-delete
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    // ── Encryption fields ───────────────────────────────────────
    iv: {
        type: String,
        default: null
    },
    authTag: {
        type: String,
        default: null
    }
});

/**
 * Generates a unique 6-character alphanumeric code (uppercase).
 * Retries until it finds one not already in use.
 */
contentSchema.statics.generateCode = async function () {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code, exists = true;
    while (exists) {
        code = Array.from({ length: 6 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
        exists = !!(await this.findOne({ code }));
    }
    return code;
};

module.exports = mongoose.model('Content', contentSchema);
