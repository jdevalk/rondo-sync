require('varlock/auto-load');

const { openDb, getLatestSportlinkResults } = require('./laposta-db');

/**
 * Map Sportlink gender codes to Stadion format
 * @param {string} sportlinkGender - Gender code from Sportlink (Male/Female)
 * @returns {string} - 'M', 'F', or empty string for unknown
 */
function mapGender(sportlinkGender) {
  const mapping = { 'Male': 'M', 'Female': 'F' };
  return mapping[sportlinkGender] || '';
}

/**
 * Build name fields, merging Dutch tussenvoegsel into last name
 * @param {Object} member - Sportlink member record
 * @returns {{first_name: string, last_name: string}}
 */
function buildName(member) {
  const firstName = (member.FirstName || '').trim();
  const infix = (member.Infix || '').trim();
  const lastName = (member.LastName || '').trim();
  const fullLastName = [infix, lastName].filter(Boolean).join(' ');

  return {
    first_name: firstName,   // '' if missing
    last_name: fullLastName  // '' if missing
  };
}

/**
 * Build contact info array for ACF repeater
 * Only includes items where value is non-empty
 * @param {Object} member - Sportlink member record
 * @returns {Array<{type: string, value: string}>}
 */
function buildContactInfo(member) {
  const contacts = [];
  const email = (member.Email || '').trim();
  const mobile = (member.Mobile || '').trim();
  const phone = (member.Telephone || '').trim();

  if (email) contacts.push({ type: 'email', value: email });
  if (mobile) contacts.push({ type: 'mobile', value: mobile });
  if (phone) contacts.push({ type: 'phone', value: phone });

  return contacts;  // May be empty array []
}

/**
 * Build addresses array for ACF repeater
 * Only includes address if at least street or city present
 * @param {Object} member - Sportlink member record
 * @returns {Array<{street: string, number: string, addition: string, postal_code: string, city: string}>}
 */
function buildAddresses(member) {
  const street = (member.StreetName || '').trim();
  const city = (member.City || '').trim();

  // Omit empty address entirely
  if (!street && !city) return [];

  return [{
    street: street,
    number: (member.AddressNumber || '').toString().trim(),
    addition: (member.AddressNumberAppendix || '').trim(),
    postal_code: (member.ZipCode || '').trim(),
    city: city
  }];
}

/**
 * Build important dates array for ACF repeater
 * Only includes birth date if available
 * @param {Object} member - Sportlink member record
 * @returns {Array<{type: string, date: string}>}
 */
function buildImportantDates(member) {
  if (!member.DateOfBirth) return [];
  return [{ type: 'birth_date', date: member.DateOfBirth }];
}

/**
 * Transform a Sportlink member to Stadion person format
 * @param {Object} sportlinkMember - Raw Sportlink member record
 * @returns {{knvb_id: string, email: string|null, data: Object}}
 */
function preparePerson(sportlinkMember) {
  const name = buildName(sportlinkMember);
  const title = [name.first_name, name.last_name].filter(Boolean).join(' ');

  return {
    knvb_id: sportlinkMember.PublicPersonId, // relatiecode for matching
    email: (sportlinkMember.Email || '').trim().toLowerCase() || null,
    data: {
      title: title,
      status: 'publish',
      meta: {
        knvb_id: sportlinkMember.PublicPersonId,
        first_name: name.first_name,    // '' if missing (not undefined)
        last_name: name.last_name,      // '' if missing (not undefined)
        gender: mapGender(sportlinkMember.GenderCode)  // '' if unknown
      },
      acf: {
        contact_info: buildContactInfo(sportlinkMember),    // [] if none
        addresses: buildAddresses(sportlinkMember),          // [] if none
        important_dates: buildImportantDates(sportlinkMember) // [] if none
      }
    }
  };
}

/**
 * Validate member has required fields for Stadion sync
 * @param {Object} member - Sportlink member record
 * @returns {boolean}
 */
function isValidMember(member) {
  // PublicPersonId (KNVB ID) is required for matching
  if (!member.PublicPersonId) return false;
  // Must have at least a name
  if (!member.FirstName && !member.LastName) return false;
  return true;
}

/**
 * Prepare Stadion members from Sportlink data
 * @param {Object} options
 * @param {Object} [options.logger] - Logger instance with log(), verbose(), error() methods
 * @param {boolean} [options.verbose=false] - Verbose mode
 * @returns {Promise<{success: boolean, members: Array, skipped: number, error?: string}>}
 */
async function runPrepare(options = {}) {
  const { logger, verbose = false } = options;

  // Use provided logger or create simple fallback
  const log = logger ? logger.log.bind(logger) : console.log;
  const logVerbose = logger ? logger.verbose.bind(logger) : (verbose ? console.log : () => {});
  const logError = logger ? logger.error.bind(logger) : console.error;

  try {
    // Load Sportlink data from SQLite
    const db = openDb();
    let sportlinkData;
    try {
      const resultsJson = getLatestSportlinkResults(db);
      if (!resultsJson) {
        const errorMsg = 'No Sportlink results found in SQLite. Run the download first.';
        logError(errorMsg);
        return { success: false, members: [], skipped: 0, error: errorMsg };
      }
      sportlinkData = JSON.parse(resultsJson);
    } finally {
      db.close();
    }

    const members = Array.isArray(sportlinkData.Members) ? sportlinkData.Members : [];
    logVerbose(`Found ${members.length} Sportlink members in database`);

    // Filter out invalid members and transform valid ones
    const validMembers = [];
    let skippedCount = 0;

    members.forEach((member, index) => {
      if (!isValidMember(member)) {
        skippedCount++;
        const reason = !member.PublicPersonId
          ? 'missing KNVB ID'
          : 'missing name';
        logVerbose(`Skipping member at index ${index}: ${reason}`);
        return;
      }

      const prepared = preparePerson(member);
      validMembers.push(prepared);
    });

    logVerbose(`Prepared ${validMembers.length} members for Stadion sync (${skippedCount} skipped)`);

    if (verbose && validMembers.length > 0) {
      logVerbose('Sample prepared member:');
      logVerbose(JSON.stringify(validMembers[0], null, 2));
    }

    return {
      success: true,
      members: validMembers,
      skipped: skippedCount
    };
  } catch (err) {
    const errorMsg = err.message || String(err);
    logError('Error preparing Stadion members:', errorMsg);
    return { success: false, members: [], skipped: 0, error: errorMsg };
  }
}

module.exports = { runPrepare };

// CLI entry point
if (require.main === module) {
  const verbose = process.argv.includes('--verbose');

  runPrepare({ verbose })
    .then(result => {
      if (!result.success) {
        process.exitCode = 1;
      } else if (!verbose) {
        // In default mode, print summary
        console.log(`Prepared ${result.members.length} members for Stadion sync (${result.skipped} skipped - missing KNVB ID or name)`);
      }
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exitCode = 1;
    });
}
