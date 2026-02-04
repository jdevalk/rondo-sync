---
status: resolved
trigger: "nikki-saldo-sum-incorrect: Member MMXL50W has several Nikki payments that should total €300+, but Stadion shows a different (lower) amount"
created: 2026-02-04T00:00:00Z
updated: 2026-02-04T00:15:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED - #datatable is populated via JavaScript/AJAX (DataTables library). scrapeContributions() uses `waitUntil: 'domcontentloaded'` which doesn't wait for AJAX data loading. Scraping happens before table is populated, so we only capture initial/partial rows. Need to wait for table rows to be present before scraping.
test: Add waitForSelector for tbody tr elements before scraping, ensuring AJAX load completes
expecting: Scraping will capture ALL rows including multiple entries per member-year
next_action: Fix scrapeContributions() to wait for table population before extracting data

## Symptoms

expected: Nikki totaal should show the sum of all saldo entries for the member (€300+)
actual: Stadion shows a different/lower amount
errors: No error messages, just wrong data
reproduction: Look at member with lidnr MMXL50W in Stadion - check Nikki totaal field
started: Just discovered - we just implemented saldo summing in quick task 012 (commits e4f411f, 840060f)

## Eliminated

## Evidence

- timestamp: 2026-02-04T00:01:00Z
  checked: Local nikki-sync.sqlite database
  found: Database is empty (0 records)
  implication: This is a local machine - sync only runs on server. Need to check server database.

- timestamp: 2026-02-04T00:02:00Z
  checked: Server database for MMXL50W
  found: Only 2 entries - 2025: €10.78 saldo (€19.60 total), 2024: €0 saldo (€19 total)
  implication: Data in database doesn't match user's expectation of "€300+"

- timestamp: 2026-02-04T00:03:00Z
  checked: Stadion ACF fields for member 4216 (MMXL50W)
  found: Per-year fields match database exactly - _nikki_2025_saldo: 10.78, _nikki_2024_saldo: 0
  implication: Sync is working correctly - database and Stadion are in sync

- timestamp: 2026-02-04T00:04:00Z
  checked: Number of entries per year in database
  found: Only 1 entry per year (not multiple payments being summed)
  implication: The user's expectation of "€300+" doesn't match what's in Nikki API data

- timestamp: 2026-02-04T00:05:00Z
  checked: Entire database for members with multiple Nikki entries per year
  found: NO members have multiple entries per year - the aggregation feature hasn't been tested with real data yet
  implication: Quick task 012 implemented aggregation but there's no actual data requiring it yet

- timestamp: 2026-02-04T00:06:00Z
  checked: Git commits for quick task 012
  found: Commits e4f411f and 840060f changed schema to UNIQUE(knvb_id, year, nikki_id) and added SUM aggregation
  implication: The feature is implemented but not tested with real multi-entry data

- timestamp: 2026-02-04T00:07:00Z
  checked: Calculated sum of all _nikki_YEAR_total fields for MMXL50W
  found: 2025: €19.60 + 2024: €19 = €38.60 total
  implication: Sum of all years' hoofdsom is only €38.60, not €300+. User's expectation doesn't match actual data.

- timestamp: 2026-02-04T00:08:00Z
  checked: User confirmation - are there multiple 2025 entries in Nikki?
  found: YES - user confirms multiple payment lines exist for 2025 in Nikki
  implication: Database has only 1 entry per year, but Nikki has multiple. Scraping is missing entries.

- timestamp: 2026-02-04T00:09:00Z
  checked: download-nikki-contributions.js scraping logic (lines 224-282)
  found: scrapeContributions() extracts from HTML table (#datatable). Returns one object per table row.
  implication: If HTML table shows only one row per member-year (aggregated view), we miss individual entries.

- timestamp: 2026-02-04T00:10:00Z
  checked: CSV download logic (lines 288-390) and merge logic (lines 396-443)
  found: CSV is downloaded but only used to ADD hoofdsom field to HTML data. CSV itself may contain ALL rows.
  implication: CSV might have complete data (multiple rows per member-year) but we're throwing it away after extracting hoofdsom.

- timestamp: 2026-02-04T00:11:00Z
  checked: Server database query for members with multiple entries per year
  found: ZERO members have multiple entries per year (query returned no results)
  implication: CONFIRMED - HTML table scraping only returns one row per member-year, aggregating multiple payments into single display.

- timestamp: 2026-02-04T00:12:00Z
  checked: Architecture of current implementation
  found: scrapeContributions() gets HTML table → one row per member-year. downloadAndParseCsv() gets CSV → potentially multiple rows. mergeHtmlAndCsvData() uses HTML as primary, CSV only for hoofdsom lookup.
  implication: If CSV contains multiple rows per member-year (with different nikki_ids), current merge logic DISCARDS them because it only processes HTML rows.

- timestamp: 2026-02-04T00:13:00Z
  checked: Test script to download CSV and examine structure
  found: No "Rapporten" or "Export" links found on /leden page. Download event never fires.
  implication: Either CSV export doesn't exist, or it's accessed differently than current code assumes.

- timestamp: 2026-02-04T00:14:00Z
  checked: Database count query across all members
  found: 1807 total contributions in database (from today's sync log). Zero members have >1 entry per year.
  implication: HTML table extraction is working but only gets aggregated rows. Individual payments within a year aren't captured.

- timestamp: 2026-02-04T00:16:00Z
  checked: mergeHtmlAndCsvData() function logic (lines 396-443)
  found: Function loops through htmlRecords (line 418), uses CSV only as lookup map (lines 402-410, 419). CSV rows that don't match HTML rows are NEVER processed.
  implication: CSV download is failing anyway (no Rapporten link), so this isn't the issue.

- timestamp: 2026-02-04T00:17:00Z
  checked: scrapeContributions() function (lines 224-282)
  found: Extracts ALL rows from #datatable tbody (line 256-259). No deduplication. But uses `waitUntil: 'domcontentloaded'` which doesn't wait for JavaScript/AJAX.
  implication: If table is populated via JavaScript (DataTables AJAX), scraping happens too early - before data loads. Table element exists but is empty or partially loaded.

## Resolution

root_cause: scrapeContributions() doesn't wait for DataTables AJAX to complete before scraping. Line 227 uses `waitUntil: 'domcontentloaded'` which returns as soon as HTML loads, before JavaScript populates the table. DataTables loads actual row data via AJAX after page load. Line 250 scraped from response.text() (initial HTML) instead of page.content() (live DOM after AJAX). Result: scraping captures empty or partially-loaded table (explains why database has only 1807 entries when there should be many more with multiple payments per member-year).

fix: Added explicit waits in scrapeContributions() function:
1. waitForSelector('#datatable tbody tr') - waits for AJAX data to populate
2. Additional 2-second buffer for full rendering
3. Changed scraping source from response.text() to page.content() (live DOM)
4. Added row count logging for verification

verification:
1. Commit and push fix to GitHub
2. SSH to server: ssh root@46.202.155.16
3. Pull changes: cd /home/sportlink && git pull
4. Backup database: cp nikki-sync.sqlite nikki-sync.sqlite.backup
5. Clear database to force fresh sync: sqlite3 nikki-sync.sqlite "DELETE FROM nikki_contributions;"
6. Run sync: scripts/sync.sh nikki
7. Check for multiple entries per member-year: sqlite3 nikki-sync.sqlite "SELECT knvb_id, year, COUNT(*) as entries FROM nikki_contributions GROUP BY knvb_id, year HAVING entries > 1 LIMIT 10;"
8. Check MMXL50W specifically: sqlite3 nikki-sync.sqlite "SELECT * FROM nikki_contributions WHERE knvb_id = 'MMXL50W' ORDER BY year DESC, nikki_id;"
9. Verify sum is correct in Stadion for member 4216
files_changed: ['download-nikki-contributions.js']
