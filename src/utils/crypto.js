const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'place_a_32_char_key_here_for_dev_'; // Must be 32 chars
const IV_LENGTH = 16;

/**
 * Encrypts plaintext using AES-256-CBC
 * @param {string} text
 */
exports.encrypt = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypts text encrypted by the encrypt function
 * @param {string} text - Encrypted string in "iv:content" format
 */
exports.decrypt = (text) => {
  if (!text || !text.includes(':')) return null;
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};
