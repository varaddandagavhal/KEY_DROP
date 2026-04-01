require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');
const apiRoutes = require('./routes/api');
const startCleanupJob = require('./jobs/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect DB and start server
connectDB().then(() => {

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '60mb' }));
    app.use(express.urlencoded({ extended: true, limit: '60mb' }));

    // Static frontend
    app.use(express.static(path.join(__dirname, 'public')));

    // API routes
    app.use('/api', apiRoutes);

    // Routes
    app.get('/retrieve', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'retrieve.html'));
    });

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Cron
    startCleanupJob();

    // Start server
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

}).catch(err => {
    console.error("❌ DB connection failed:", err);
});

module.exports = app;
