const Content = require('../models/Content');
const { deleteFile } = require('../utils/storage');
const cron = require('node-cron');

/**
 * Runs every hour.
 * Deletes S3 objects first, then removes the metadata documents.
 */
const startCleanupJob = () => {
    cron.schedule('0 * * * *', async () => {
        try {
            const expired = await Content.find(
                { expiresAt: { $lt: new Date() } },
                { s3Key: 1, code: 1 }
            );

            if (expired.length === 0) return;

            for (const doc of expired) {
                if (doc.s3Key) await deleteFile(doc.s3Key);
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
