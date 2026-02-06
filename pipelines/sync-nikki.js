require('varlock/auto-load');

const { createSyncLogger } = require('../lib/logger');
const { formatDuration, formatTimestamp, parseCliArgs } = require('../lib/utils');
const { runNikkiDownload } = require('../steps/download-nikki-contributions');
const { runNikkiRondoClubSync } = require('../steps/sync-nikki-to-rondo-club');

/**
 * Print summary report for Nikki sync
 */
function printSummary(logger, stats) {
  const divider = '========================================';
  const minorDivider = '----------------------------------------';

  logger.log('');
  logger.log(divider);
  logger.log('NIKKI SYNC SUMMARY');
  logger.log(divider);
  logger.log('');
  logger.log(`Completed: ${stats.completedAt}`);
  logger.log(`Duration: ${stats.duration}`);
  logger.log('');

  logger.log('NIKKI DOWNLOAD');
  logger.log(minorDivider);
  logger.log(`Contributions downloaded: ${stats.download.count}`);
  logger.log('');

  logger.log('RONDO CLUB SYNC');
  logger.log(minorDivider);
  logger.log(`Members updated: ${stats.rondoClub.updated}`);
  logger.log(`Skipped (no changes): ${stats.rondoClub.skipped}`);
  logger.log(`Skipped (no Rondo Club ID): ${stats.rondoClub.noRondoClubId}`);
  if (stats.rondoClub.errors > 0) {
    logger.log(`Errors: ${stats.rondoClub.errors}`);
  }
  logger.log('');

  logger.log(divider);
}

/**
 * Run Nikki sync pipeline (daily)
 * - Download Nikki contribution data from nikki-online.nl
 * - Sync contribution status to Rondo Club member WYSIWYG field
 */
async function runNikkiSync(options = {}) {
  const { verbose = false, force = false } = options;

  const logger = createSyncLogger({ verbose, prefix: 'nikki' });
  const startTime = Date.now();

  const stats = {
    completedAt: '',
    duration: '',
    download: {
      count: 0,
      errors: []
    },
    rondoClub: {
      updated: 0,
      skipped: 0,
      noRondoClubId: 0,
      errors: 0
    }
  };

  try {
    // Step 1: Download Nikki contributions
    logger.verbose('Downloading Nikki contributions...');
    try {
      const downloadResult = await runNikkiDownload({ logger, verbose });
      stats.download.count = downloadResult.count || 0;
      if (!downloadResult.success) {
        stats.download.errors.push({
          message: downloadResult.error || 'Unknown error',
          system: 'nikki-download'
        });
      }
    } catch (err) {
      logger.error(`Nikki download failed: ${err.message}`);
      stats.download.errors.push({
        message: `Nikki download failed: ${err.message}`,
        system: 'nikki-download'
      });
    }

    // Step 2: Sync to Rondo Club
    logger.verbose('Syncing Nikki contributions to Rondo Club...');
    try {
      const rondoClubResult = await runNikkiRondoClubSync({ logger, verbose, force });
      stats.rondoClub.updated = rondoClubResult.updated;
      stats.rondoClub.skipped = rondoClubResult.skipped;
      stats.rondoClub.noRondoClubId = rondoClubResult.noRondoClubId;
      stats.rondoClub.errors = rondoClubResult.errors;
    } catch (err) {
      logger.error(`Rondo Club sync failed: ${err.message}`);
      stats.rondoClub.errors++;
    }

    // Complete
    stats.completedAt = formatTimestamp();
    stats.duration = formatDuration(Date.now() - startTime);

    printSummary(logger, stats);
    logger.log(`Log file: ${logger.getLogPath()}`);
    logger.close();

    return {
      success: stats.download.errors.length === 0 && stats.rondoClub.errors === 0,
      stats
    };
  } catch (err) {
    const errorMsg = err.message || String(err);
    logger.error(`Fatal error: ${errorMsg}`);

    stats.completedAt = formatTimestamp();
    stats.duration = formatDuration(Date.now() - startTime);
    printSummary(logger, stats);

    logger.close();

    return { success: false, stats, error: errorMsg };
  }
}

module.exports = { runNikkiSync };

if (require.main === module) {
  const { verbose, force } = parseCliArgs();

  runNikkiSync({ verbose, force })
    .then(result => {
      if (!result.success) {
        process.exitCode = 1;
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exitCode = 1;
    });
}
