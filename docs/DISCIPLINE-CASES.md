# Discipline Cases - Stadion Field Reference

This document describes the fields the sync code expects Stadion to have for discipline cases.

## Custom Post Type

**Post Type:** `discipline_case` (Tuchtzaak/Tuchtzaken in Dutch UI)

**REST Endpoint:** `wp/v2/discipline-cases`

## ACF Fields

The sync code (`submit-stadion-discipline.js`) expects these ACF fields:

| Field Name | Type | Description | Required |
|------------|------|-------------|----------|
| `dossier_id` | Text | Unique case identifier from Sportlink (e.g., T-12345) | Yes |
| `person` | Post Object | Stadion person post ID (returns integer) | No |
| `match_date` | Date Picker | Date of the match (returns Ymd format: 20260115) | No |
| `match_description` | Text | Match details (e.g., "JO11-1 vs Ajax") | No |
| `team_name` | Text | Team name from Sportlink | No |
| `charge_codes` | Text | Charge code(s) from KNVB (single code) | No |
| `charge_description` | Textarea | Full charge description | No |
| `sanction_description` | Textarea | Sanction/penalty description | No |
| `processing_date` | Date Picker | Date case was processed (returns Ymd format) | No |
| `administrative_fee` | Number | Fee amount in euros (e.g., 25.00) | No |
| `is_charged` | True/False | Whether fee was charged ("Is doorbelast") | No |

**Notes:**
- `person` field uses Post Object type (not Relationship) — returns single integer ID, not array
- `dossier_id` has server-side uniqueness validation — duplicate IDs will be rejected
- Date fields use ACF date_picker with return format `Ymd` (e.g., "20260115")

## Taxonomy

**Taxonomy:** `seizoen`

**REST Endpoint:** `wp/v2/seizoen`

Non-hierarchical taxonomy (like tags). Used to categorize cases by season (e.g., "2025-2026"). Created automatically when new seasons are encountered.

**Current Season Support:**
- Term meta `is_current_season` flag marks active season
- Custom endpoint: `GET /wp-json/stadion/v1/current-season` returns current season term

## REST API Usage

### Create Case
```http
POST /wp-json/wp/v2/discipline-cases
```

### Update Case
```http
PUT /wp-json/wp/v2/discipline-cases/{id}
```

### Find by Dossier ID
```http
GET /wp-json/wp/v2/discipline-cases?meta_key=dossier_id&meta_value=T-12345
```

### Example Payload
```json
{
  "title": "Jan Jansen - JO11-1 vs Ajax - 2026-01-15",
  "status": "publish",
  "seizoen": [123],
  "acf": {
    "dossier_id": "T-12345",
    "person": 456,
    "match_date": "20260115",
    "match_description": "JO11-1 vs Ajax JO11-2",
    "team_name": "JO11-1",
    "charge_codes": "R2.3",
    "charge_description": "Wangedrag tegen scheidsrechter",
    "sanction_description": "1 wedstrijd schorsing",
    "processing_date": "20260120",
    "administrative_fee": "25.00",
    "is_charged": true
  }
}
```

### Get/Create Season Terms
```http
GET /wp-json/wp/v2/seizoen?slug=2025-2026
POST /wp-json/wp/v2/seizoen
```

### Set Current Season (via term meta)
After creating a season term, you can mark it as current by updating term meta.

## Requirements

- ACF Pro (for post_object fields and REST API integration)
- `show_in_rest` must be `true` for the post type, taxonomy, and all ACF fields
- The `person` field links to the existing `person` post type

## Access Control

**Capability:** `fairplay`

Stadion v13.0 adds capability-based access control:
- Only users with `fairplay` capability can view discipline cases in the UI
- Administrators automatically receive this capability
- REST API access follows standard WordPress `read` permissions (UI-level restriction only)

## Source Code Reference

- `submit-stadion-discipline.js` - Main sync logic
- `lib/discipline-db.js` - SQLite state tracking
- `download-discipline-cases.js` - Downloads cases from Sportlink
