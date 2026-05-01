const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

if (KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
}

/**
 * Encrypts text content using AES-256-GCM.
 * @param {string} text 
 * @returns {object} { encryptedText, iv, authTag }
 */
function encryptText(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
        encryptedText: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag
    };
}

/**
 * Decrypts text content using AES-256-GCM.
 * @param {string} encryptedText 
 * @param {string} ivHex 
 * @param {string} authTagHex 
 * @returns {string}
 */
function decryptText(encryptedText, ivHex, authTagHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Returns a cipher stream for encrypting files.
 * @param {Buffer} iv 
 * @returns {crypto.Cipher}
 */
function createEncryptionStream(iv) {
    return crypto.createCipheriv(ALGORITHM, KEY, iv);
}

/**
 * Returns a decipher stream for decrypting files.
 * @param {Buffer} iv 
 * @param {Buffer} authTag 
 * @returns {crypto.Decipher}
 */
function createDecryptionStream(iv, authTag) {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher;
}

module.exports = {
    encryptText,
    decryptText,
    createEncryptionStream,
    createDecryptionStream,
    IV_LENGTH
};
