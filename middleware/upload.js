const multer = require('multer');

// Store files in memory as Buffer (saved to MongoDB)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Allow all file types
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB max
    }
});

module.exports = upload;
