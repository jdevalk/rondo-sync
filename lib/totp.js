/**
 * TOTP (Time-based One-Time Password) generation utilities.
 *
 * Provides TOTP generation for services that use ASCII secrets (like Nikki)
 * or base32-encoded secrets in otpauth:// URLs.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a base32-encoded string to a Buffer.
 * @param {string} input - Base32 encoded string
 * @returns {Buffer} Decoded bytes
 */
function decodeBase32(input) {
  const clean = String(input).toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Parse an otpauth:// URL and extract TOTP parameters.
 * @param {string} url - otpauth:// URL string
 * @returns {Object|null} Parsed parameters or null if invalid
 */
function parseOtpAuthUrl(url) {
  if (!url || !url.startsWith('otpauth://')) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  return {
    secret: parsed.searchParams.get('secret') || '',
    issuer: parsed.searchParams.get('issuer') || '',
    algorithm: (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase(),
    digits: parseInt(parsed.searchParams.get('digits') || '6', 10),
    period: parseInt(parsed.searchParams.get('period') || '30', 10)
  };
}

/**
 * Generate TOTP code using a key buffer.
 * @param {Buffer} key - Secret key as Buffer
 * @param {number} [digits=6] - Number of digits in output
 * @param {number} [step=30] - Time step in seconds
 * @param {string} [algorithm='sha1'] - Hash algorithm
 * @returns {string} TOTP code
 */
function generateTotpWithKey(key, digits = 6, step = 30, algorithm = 'sha1') {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter % 0x100000000, 4);

  const algo = String(algorithm).toLowerCase();
  const hmac = crypto.createHmac(algo, key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);

  return (code % (10 ** digits)).toString().padStart(digits, '0');
}

/**
 * Generate TOTP code from an ASCII secret string.
 * Used for services that use plain ASCII secrets rather than base32.
 * @param {string} secret - ASCII secret string
 * @param {number} [digits=6] - Number of digits in output
 * @param {number} [step=30] - Time step in seconds
 * @returns {string} TOTP code
 */
function generateAsciiTotp(secret, digits = 6, step = 30) {
  return generateTotpWithKey(Buffer.from(secret, 'ascii'), digits, step, 'sha1');
}

/**
 * Generate TOTP from a secret value that may be either:
 * - An otpauth:// URL with embedded parameters
 * - A plain ASCII secret string
 *
 * @param {string} secretValue - Secret string or otpauth:// URL
 * @returns {string} TOTP code
 */
function generateTotp(secretValue) {
  const parsed = parseOtpAuthUrl(secretValue);
  if (parsed && parsed.secret) {
    const key = decodeBase32(parsed.secret);
    return generateTotpWithKey(key, parsed.digits, parsed.period, parsed.algorithm);
  }
  return generateAsciiTotp(secretValue);
}

module.exports = {
  decodeBase32,
  parseOtpAuthUrl,
  generateTotpWithKey,
  generateAsciiTotp,
  generateTotp
};
