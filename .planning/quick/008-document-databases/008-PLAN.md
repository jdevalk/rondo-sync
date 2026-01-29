---
phase: quick
plan: 008
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/DATABASES.md
autonomous: true

must_haves:
  truths:
    - "User can find documentation for all three SQLite databases"
    - "Each table is documented with all fields and their purposes"
    - "Relationships between tables are clearly explained"
  artifacts:
    - path: "docs/DATABASES.md"
      provides: "Complete database documentation"
      min_lines: 200
  key_links: []
---

<objective>
Document all three SQLite databases (laposta-sync.sqlite, stadion-sync.sqlite, nikki-sync.sqlite) with complete schema documentation including all tables, fields, and their purposes.

Purpose: User cannot find certain database fields - comprehensive documentation will serve as reference
Output: docs/DATABASES.md with complete schema for all three databases
</objective>

<execution_context>
@/Users/joostdevalk/.claude/get-shit-done/workflows/execute-plan.md
@/Users/joostdevalk/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@laposta-db.js
@lib/stadion-db.js
@lib/nikki-db.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create comprehensive database documentation</name>
  <files>docs/DATABASES.md</files>
  <action>
Create docs/DATABASES.md documenting all three databases:

## 1. laposta-sync.sqlite (Laposta email list sync)

### Tables:
**sportlink_runs**
- id: INTEGER PRIMARY KEY - Auto-increment ID
- created_at: TEXT NOT NULL - ISO timestamp of run
- results_json: TEXT NOT NULL - Raw JSON results from Sportlink download

**laposta_fields**
- list_id: TEXT NOT NULL - Laposta list ID
- field_id: TEXT NOT NULL - Laposta field ID
- custom_name: TEXT NOT NULL - Field tag/name
- datatype: TEXT - Field data type
- required: INTEGER - 1=required, 0=optional
- options_json: TEXT - JSON array of select options
- updated_at: TEXT NOT NULL - Last update timestamp
- PRIMARY KEY (list_id, field_id)

**members**
- id: INTEGER PRIMARY KEY - Auto-increment ID
- list_index: INTEGER NOT NULL - Which Laposta list (0-3 for LAPOSTA_LIST through LAPOSTA_LIST4)
- list_id: TEXT - Laposta list ID
- email: TEXT NOT NULL - Member email
- custom_fields_json: TEXT NOT NULL - JSON of custom field values
- source_hash: TEXT NOT NULL - SHA-256 hash of email + custom_fields for change detection
- last_seen_at: TEXT NOT NULL - Last time member appeared in Sportlink data
- last_synced_at: TEXT - Last successful sync to Laposta
- last_synced_hash: TEXT - Hash of last synced data (compare with source_hash)
- last_synced_custom_fields_json: TEXT - Previous custom_fields for diff display
- created_at: TEXT NOT NULL - First seen timestamp
- UNIQUE (list_index, email)

## 2. stadion-sync.sqlite (WordPress Stadion sync)

### Tables:
**stadion_members** - Member/person records
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL UNIQUE - KNVB public person ID (primary identifier)
- stadion_id: INTEGER - WordPress post ID (for updates)
- email: TEXT - Member email
- data_json: TEXT NOT NULL - Full member data as JSON
- source_hash: TEXT NOT NULL - SHA-256 for change detection
- last_seen_at: TEXT NOT NULL - Last in Sportlink data
- last_synced_at: TEXT - Last sync to Stadion
- last_synced_hash: TEXT - Hash of last synced data
- created_at: TEXT NOT NULL
- person_image_date: TEXT - Date of photo in Sportlink (for change detection)
- photo_state: TEXT DEFAULT 'no_photo' - Photo sync state machine: no_photo|pending_download|downloaded|pending_upload|synced|pending_delete
- photo_state_updated_at: TEXT - When photo state last changed

**stadion_parents** - Parent/guardian records
- id: INTEGER PRIMARY KEY
- email: TEXT NOT NULL UNIQUE - Parent email (primary identifier, no KNVB ID)
- stadion_id: INTEGER - WordPress post ID
- data_json: TEXT NOT NULL - Parent data + childKnvbIds array
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- last_synced_at: TEXT
- last_synced_hash: TEXT
- created_at: TEXT NOT NULL

**stadion_important_dates** - Birth dates synced to Stadion
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- date_type: TEXT NOT NULL - e.g., 'birth_date'
- date_value: TEXT NOT NULL - YYYY-MM-DD format
- stadion_date_id: INTEGER - WordPress important_date post ID
- source_hash: TEXT NOT NULL
- last_synced_hash: TEXT
- last_synced_at: TEXT
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, date_type)

**stadion_teams** - Team records
- id: INTEGER PRIMARY KEY
- team_name: TEXT NOT NULL COLLATE NOCASE - Team name (case-insensitive)
- sportlink_id: TEXT UNIQUE - Sportlink team ID (for rename handling)
- stadion_id: INTEGER - WordPress team post ID
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- last_synced_at: TEXT
- last_synced_hash: TEXT
- created_at: TEXT NOT NULL
- game_activity: TEXT - e.g., "Veld" or "Zaal"
- gender: TEXT - M/V/Mixed
- player_count: INTEGER - Number of players
- staff_count: INTEGER - Number of staff

**stadion_work_history** - Member-team assignments (work history)
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- team_name: TEXT NOT NULL - Team name
- stadion_work_history_id: INTEGER - WordPress work_history row index
- is_backfill: INTEGER DEFAULT 0 - 1 if from historical backfill
- source_hash: TEXT NOT NULL
- last_synced_hash: TEXT
- last_synced_at: TEXT
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, team_name)

**sportlink_team_members** - Raw team membership from Sportlink
- id: INTEGER PRIMARY KEY
- sportlink_team_id: TEXT NOT NULL - Sportlink team ID
- sportlink_person_id: TEXT NOT NULL - Sportlink person ID (KNVB ID)
- member_type: TEXT NOT NULL - 'player' or 'staff'
- role_description: TEXT - e.g., "Trainer", "Keeper"
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- created_at: TEXT NOT NULL
- UNIQUE(sportlink_team_id, sportlink_person_id)

**stadion_commissies** - Committee records
- id: INTEGER PRIMARY KEY
- commissie_name: TEXT NOT NULL UNIQUE - Committee name
- sportlink_id: TEXT UNIQUE - Sportlink committee ID
- stadion_id: INTEGER - WordPress commissie post ID
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- last_synced_at: TEXT
- last_synced_hash: TEXT
- created_at: TEXT NOT NULL

**sportlink_member_functions** - Club-level functions (e.g., "Voorzitter")
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- function_description: TEXT NOT NULL - Function name
- relation_start: TEXT - Start date
- relation_end: TEXT - End date (NULL = current)
- is_active: INTEGER DEFAULT 1 - 1=active, 0=ended
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, function_description)

**sportlink_member_committees** - Committee memberships
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- committee_name: TEXT NOT NULL - Committee name
- sportlink_committee_id: TEXT - Sportlink committee ID
- role_name: TEXT - Role within committee
- relation_start: TEXT - Start date
- relation_end: TEXT - End date
- is_active: INTEGER DEFAULT 1
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, committee_name)

**stadion_commissie_work_history** - Work history for committee memberships
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- commissie_name: TEXT NOT NULL - Committee name
- role_name: TEXT - Role in committee
- stadion_work_history_id: INTEGER - WordPress work_history row index
- is_backfill: INTEGER DEFAULT 0
- source_hash: TEXT NOT NULL
- last_synced_hash: TEXT
- last_synced_at: TEXT
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, commissie_name, role_name)

**sportlink_member_free_fields** - Free fields from Sportlink /other tab
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL UNIQUE - Member KNVB ID
- freescout_id: INTEGER - FreeScout customer ID
- vog_datum: TEXT - VOG certificate date
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- created_at: TEXT NOT NULL

## 3. nikki-sync.sqlite (Contribution/dues tracking)

### Tables:
**nikki_contributions** - Member contribution records per year
- id: INTEGER PRIMARY KEY
- knvb_id: TEXT NOT NULL - Member KNVB ID
- year: INTEGER NOT NULL - Contribution year
- nikki_id: TEXT NOT NULL - Nikki system ID
- saldo: REAL - Outstanding balance (positive = owes money)
- status: TEXT - Payment status
- source_hash: TEXT NOT NULL
- last_seen_at: TEXT NOT NULL
- created_at: TEXT NOT NULL
- UNIQUE(knvb_id, year)

Include sections for:
- Overview with purpose of each database
- Change detection pattern (source_hash vs last_synced_hash)
- Photo state machine diagram
- Key relationships between tables
  </action>
  <verify>
- File exists at docs/DATABASES.md
- All three databases documented
- All tables from each db module are covered
- Fields have descriptions
  </verify>
  <done>
- docs/DATABASES.md exists with 200+ lines
- All 15 tables documented with all fields
- Purpose and relationships clearly explained
  </done>
</task>

</tasks>

<verification>
- docs/DATABASES.md exists
- All tables from laposta-db.js documented (3 tables)
- All tables from stadion-db.js documented (11 tables)
- All tables from nikki-db.js documented (1 table)
- Each field has type and purpose
</verification>

<success_criteria>
- Complete database reference documentation created
- User can find any field by searching the document
- Change detection pattern is explained
</success_criteria>

<output>
After completion, create `.planning/quick/008-document-databases/008-SUMMARY.md`
</output>
