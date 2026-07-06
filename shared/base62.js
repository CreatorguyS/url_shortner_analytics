/**
 * Cryptographically secure Base62 short code generator.
 * Replaces the original Math.random()-based version with crypto.randomBytes.
 *
 * Alphabet: 0-9 a-z A-Z (62 chars)
 * Default length: 7 chars → 62^7 = ~3.5 trillion combinations
 */

"use strict";

const crypto = require("crypto");

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARS_LENGTH = CHARS.length; // 62

/**
 * Generate a cryptographically secure random short code.
 * 
 * REJECTION SAMPLING:
 *   This prevents modulo bias. If we just did byte % 62, some values
 *   would appear more often than others (because 256 % 62 ≠ 0).
 *   
 *   Solution: Only accept bytes < 248 (which is (256/62)*62)
 *   This ensures each base62 digit appears with equal probability.
 * 
 * @param {number} length - Number of characters in the code (default: 7)\n * @returns {string} Random short code like \"aB12xYz\"\n * \n * EXAMPLE:\n *   generateShortCode(7) → \"R190hEy\"\n *   generateShortCode(6) → \"a2XJEX\"\n */
function generateShortCode(length = 7) {
  let result = "";
  // We need `length` unbiased random chars.
  // Max unbiased byte value: Math.floor(256 / 62) * 62 - 1 = 247
  const MAX_UNBIASED = Math.floor(256 / CHARS_LENGTH) * CHARS_LENGTH;

  while (result.length < length) {
    const bytes = crypto.randomBytes(length * 2); // oversample
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < MAX_UNBIASED) {
        result += CHARS[bytes[i] % CHARS_LENGTH];
      }
    }
  }

  return result;
}

module.exports = generateShortCode;
