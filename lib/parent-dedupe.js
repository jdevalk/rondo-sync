/**
 * Parent Deduplication Utilities
 *
 * Shared utilities for email normalization and parent deduplication
 * Used by both Laposta and Rondo Club parent sync.
 */

/**
 * Check if value has a meaningful value (not null/undefined/empty string)
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Normalize email for deduplication (lowercase, trimmed)
 * @param {*} value - Email value (may be null/undefined)
 * @returns {string} - Normalized email or empty string
 */
function normalizeEmail(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Check if value is a valid email address
 * @param {*} value - Email value to check
 * @returns {boolean}
 */
function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.includes('@');
}

/**
 * Build full name string from member fields
 * @param {Object} member - Sportlink member with FirstName, Infix, LastName
 * @returns {string} - Full name or empty string
 */
function buildChildFullName(member) {
  const firstName = hasValue(member.FirstName) ? String(member.FirstName).trim() : '';
  const infix = hasValue(member.Infix) ? String(member.Infix).trim() : '';
  const lastName = hasValue(member.LastName) ? String(member.LastName).trim() : '';
  return [firstName, infix, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  hasValue,
  normalizeEmail,
  isValidEmail,
  buildChildFullName
};
