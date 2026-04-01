const Content = require('../models/Content');
const { getBucket } = require('../config/db');
const mongoose = require('mongoose');
const cron = require('node-cron');

async function deleteFromGridFS(bucket, fileId) {
    try {
        await bucket.delete(new mongoose.Types.ObjectId(fileId));
    } catch (_) { }
}

/**
 * Runs every hour.
 * Deletes GridFS file chunks first, then removes the metadata document.
 * (MongoDB TTL index removes the Content doc automatically, but GridFS
 *  chunks in the fs.chunks collection are NOT linked to TTL — so we
 *  must clean them up manually.)
 */
const startCleanupJob = () => {
    cron.schedule('0 * * * *', async () => {
        try {
            const expired = await Content.find(
                { expiresAt: { $lt: new Date() } },
                { gridfsId: 1, code: 1 }
            );

            if (expired.length === 0) return;

            const bucket = getBucket();
            for (const doc of expired) {
                if (doc.gridfsId) await deleteFromGridFS(bucket, doc.gridfsId);
            }

            const result = await Content.deleteMany({ expiresAt: { $lt: new Date() } });
            console.log(`🧹 Cleanup: removed ${result.deletedCount} expired item(s) at ${new Date().toISOString()}`);

        } catch (err) {
            console.error('❌ Cleanup job error:', err.message);
        }
    });

    console.log('⏰ Cleanup cron job scheduled (runs every hour)');
};

module.exports = startCleanupJob;
