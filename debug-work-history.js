const { openDb, getLatestSportlinkResults } = require('./laposta-db');
const { openDb: openStadionDb, upsertWorkHistory, getMemberWorkHistory } = require('./lib/stadion-db');

const lapostaDb = openDb();
const stadionDb = openStadionDb();

// Check current tracking table
const countBefore = stadionDb.prepare('SELECT COUNT(*) as c FROM stadion_work_history').get();
console.log('Tracking entries before:', countBefore.c);

// Check a sample work history entry
const sample = stadionDb.prepare('SELECT * FROM stadion_work_history LIMIT 5').all();
console.log('Sample entries:', sample);

// Check if work history records are being built
const resultsJson = getLatestSportlinkResults(lapostaDb);
const sportlinkData = JSON.parse(resultsJson);
const members = sportlinkData.Members;

let recordCount = 0;
for (const member of members) {
  const knvbId = member.PublicPersonId;
  if (!knvbId) continue;
  const unionTeam = (member.UnionTeams || '').trim();
  const clubTeam = (member.ClubTeams || '').trim();
  if (unionTeam) recordCount++;
  if (clubTeam && clubTeam !== unionTeam) recordCount++;
}

console.log('Work history records that should exist:', recordCount);

lapostaDb.close();
stadionDb.close();
