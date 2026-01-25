#!/usr/bin/env node
require('varlock/auto-load');

const postmark = require('postmark');
const fs = require('fs');

/**
 * Validate required environment variables
 * @returns {boolean} True if all required env vars are set
 */
function validateEnv() {
  const required = {
    POSTMARK_API_KEY: 'Postmark Server API Token',
    POSTMARK_FROM_EMAIL: 'Verified sender email address',
    OPERATOR_EMAIL: 'Recipient email address'
  };

  const missing = [];
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`${key} (${description})`);
    }
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(item => console.error(`  - ${item}`));
    return false;
  }

  return true;
}

/**
 * Format plain text content as HTML email
 * @param {string} textContent - Plain text content
 * @returns {string} HTML-formatted content
 */
function formatAsHtml(textContent) {
  // Escape HTML entities to prevent content from breaking HTML structure
  const escaped = textContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      max-width: 800px;
    }
    pre {
      background: #f5f5f5;
      padding: 10px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>`;
}

/**
 * Read log file content
 * @param {string} filePath - Path to log file
 * @returns {string|null} File content or null on error
 */
function readLogFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Failed to read log file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Send email via Postmark
 * @param {string} logContent - Content to send in email body
 */
function sendEmail(logContent) {
  const client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

  const today = new Date().toISOString().split('T')[0];

  client.sendEmail({
    From: `Sportlink SYNC <${process.env.POSTMARK_FROM_EMAIL}>`,
    To: process.env.OPERATOR_EMAIL,
    Subject: `Sportlink Sync Report - ${today}`,
    HtmlBody: formatAsHtml(logContent),
    TextBody: logContent
  })
    .then(() => {
      console.log('Email sent successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to send email:', error.message);
      process.exit(1);
    });
}

/**
 * Main entry point
 */
function main() {
  // Check for log file argument
  const logFilePath = process.argv[2];

  if (!logFilePath) {
    console.error('Usage: node send-email.js <log-file-path>');
    console.error('');
    console.error('Sends the contents of a log file via Postmark email.');
    console.error('');
    console.error('Required environment variables:');
    console.error('  POSTMARK_API_KEY      - Postmark Server API Token');
    console.error('  POSTMARK_FROM_EMAIL   - Verified sender email address');
    console.error('  OPERATOR_EMAIL        - Recipient email address');
    process.exit(1);
  }

  // Validate environment variables
  if (!validateEnv()) {
    process.exit(1);
  }

  // Read log file
  const logContent = readLogFile(logFilePath);
  if (logContent === null) {
    process.exit(1);
  }

  // Send email
  sendEmail(logContent);
}

main();
