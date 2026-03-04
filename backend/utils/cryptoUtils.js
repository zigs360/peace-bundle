const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-cbc';
// Ensure the encryption key is exactly 32 bytes for AES-256
const rawKey = process.env.ENCRYPTION_KEY || 'peace-bundle-secret-encryption-key-32'; 
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(rawKey)).digest();
const IV_LENGTH = 16;

/**
 * Encrypt a file buffer
 * @param {Buffer} buffer 
 * @returns {Buffer}
 */
function encrypt(buffer) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
    return encrypted;
}

/**
 * Decrypt a file buffer
 * @param {Buffer} buffer 
 * @returns {Buffer}
 */
function decrypt(buffer) {
    const iv = buffer.slice(0, IV_LENGTH);
    const encryptedData = buffer.slice(IV_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted;
}

module.exports = {
    encrypt,
    decrypt
};
