require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');
const apiRoutes = require('./routes/api');
const startCleanupJob = require('./jobs/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Connect to MongoDB ──────────────────────────────────────────────────────
connectDB();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// ─── Serve Static Frontend ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Fallback Routes ─────────────────────────────────────────────────────────
app.get('/retrieve', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'retrieve.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Cleanup Cron Job ──────────────────────────────────────────────────
startCleanupJob();

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 KeyDrop server running at http://localhost:${PORT}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  MongoDB URI: ${process.env.MONGODB_URI}\n`);
});

module.exports = app;
