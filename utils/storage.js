const crypto = require('crypto');
const {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client
} = require('@aws-sdk/client-s3');
const { createEncryptionStream, IV_LENGTH } = require('./encryption');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.S3_BUCKET_NAME;

function createKey(filename) {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `files/${crypto.randomUUID()}-${safeFilename}`;
}

async function uploadFile(buffer, filename, mimetype) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = createEncryptionStream(iv);
    const key = createKey(filename);
    const encryptedBuffer = Buffer.concat([
        cipher.update(buffer),
        cipher.final()
    ]);

    await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: encryptedBuffer,
        ContentType: mimetype
    }));

    return {
        s3Key: key,
        iv: iv.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex')
    };
}

async function getFile(key) {
    const result = await s3.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: key
    }));
    return result.Body;
}

async function deleteFile(key) {
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        }));
    } catch (_) {
        // Deleting an already removed object should not block cleanup.
    }
}

module.exports = { uploadFile, getFile, deleteFile };