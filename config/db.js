const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let bucket;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Create a GridFSBucket for file uploads/downloads
    bucket = new GridFSBucket(conn.connection.db, {
      bucketName: 'uploads'
    });
    console.log('📦 GridFS bucket "uploads" ready');

  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Returns the GridFSBucket instance (call after connectDB resolves).
 */
const getBucket = () => {
  if (!bucket) throw new Error('GridFS bucket not initialised — call connectDB first');
  return bucket;
};

module.exports = { connectDB, getBucket };
