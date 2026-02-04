/**
 * Reusable logger adapter patterns for sportlink-sync
 *
 * Provides standard patterns for creating logger adapters from the sync logger
 * or standalone verbose flags.
 */

const { readEnv, parseBool } = require('./utils');

/**
 * Create a logger adapter object with log, verbose, and error methods.
 * Used for consistent logging across all scripts.
 *
 * @param {Object} options
 * @param {Object} [options.logger] - Sync logger instance
 * @param {boolean} [options.verbose=false] - Verbose mode fallback
 * @returns {{log: Function, verbose: Function, error: Function}}
 */
function createLoggerAdapter({ logger, verbose = false } = {}) {
  return {
    log: logger ? logger.log.bind(logger) : (verbose ? console.log : () => {}),
    verbose: logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {}),
    error: logger ? logger.error.bind(logger) : console.error
  };
}

/**
 * Check if debug logging is enabled via DEBUG_LOG env var.
 * @returns {boolean}
 */
function isDebugEnabled() {
  return parseBool(readEnv('DEBUG_LOG', 'false'));
}

/**
 * Create a debug logger that only outputs when DEBUG_LOG env var is enabled.
 * Used for detailed request/response logging during development.
 *
 * @param {boolean} [enabled] - Override enabled state (defaults to DEBUG_LOG env var)
 * @returns {Function} Debug logger function
 */
function createDebugLogger(enabled) {
  const isEnabled = enabled ?? isDebugEnabled();
  return (...args) => {
    if (isEnabled) {
      console.log(...args);
    }
  };
}

module.exports = {
  createLoggerAdapter,
  createDebugLogger,
  isDebugEnabled
};
