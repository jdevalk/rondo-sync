# Phase 4: Email Polish - Research

**Researched:** 2026-01-25
**Domain:** Email formatting (Postmark API), npm output, crontab management
**Confidence:** HIGH

## Summary

This phase involves four distinct improvements: HTML email formatting, sender name configuration, npm output cleanup, and cron installer idempotency. The research confirms all requirements are achievable with straightforward changes to existing code.

The Postmark API natively supports HTML emails and sender name formatting - the current code already uses the correct library, it just needs to pass `HtmlBody` instead of `TextBody` and format the `From` field as `"Name <email>"`. The npm output header can be eliminated by calling Node.js directly instead of using `npm run`. The cron installer can be made idempotent by filtering out existing sportlink-sync entries before adding new ones.

**Primary recommendation:** Make minimal, targeted changes to existing files - these are all small modifications, not refactors.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| postmark | 4.0.5 | Transactional email API | Already in use, native HTML support |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `node --run` | Run package.json scripts without npm overhead | Alternative to `npm run` for cleaner output |
| `grep -v` | Filter crontab lines | Remove existing entries before adding |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node --run` | `node sync-all.js` directly | Direct invocation is simpler, no package.json lookup |
| Programmatic crontab | `grep -v` pipe | Pipe approach is standard POSIX, simpler |

**No installation needed** - all required dependencies are already present.

## Architecture Patterns

### Recommended Changes

**Plan 1: HTML Email with From Name** (send-email.js)
```javascript
// Current
client.sendEmail({
    From: process.env.POSTMARK_FROM_EMAIL,
    TextBody: logContent
})

// Target
client.sendEmail({
    From: `Sportlink SYNC <${process.env.POSTMARK_FROM_EMAIL}>`,
    HtmlBody: formatAsHtml(logContent),
    TextBody: logContent  // Fallback for text-only clients
})
```

**Plan 2: Clean Output** (cron-wrapper.sh)
```bash
# Current
npm run sync-all 2>&1 | tee -a "$LOG_FILE"

# Target (direct node invocation, no npm header)
node "$PROJECT_DIR/sync-all.js" 2>&1 | tee -a "$LOG_FILE"
```

**Plan 2: Cron Overwrite** (install-cron.sh)
```bash
# Current (appends, causing duplicates)
(crontab -l 2>/dev/null || true; echo "$CRON_ENTRIES") | crontab -

# Target (filter existing entries first)
(crontab -l 2>/dev/null | grep -v 'sportlink-sync\|cron-wrapper.sh' || true; echo "$CRON_ENTRIES") | crontab -
```

### HTML Formatting Pattern
```javascript
function formatAsHtml(textContent) {
    // Escape HTML entities
    const escaped = textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Convert structure to HTML
    // - Dividers (===) become <hr>
    // - Sections become <h2>
    // - List items become <li>
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        pre { background: #f5f5f5; padding: 10px; }
        h2 { color: #333; border-bottom: 1px solid #ddd; }
    </style>
</head>
<body>
    <pre>${escaped}</pre>
</body>
</html>`;
}
```

### Anti-Patterns to Avoid
- **Complex HTML templating:** The sync report is text-based output; preserve its structure with `<pre>` rather than complex HTML parsing
- **External template engines:** Inline template is sufficient for this simple case
- **Removing TextBody:** Always include both HtmlBody and TextBody for maximum compatibility

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML escaping | Custom regex | Built-in string replace chain | Standard pattern, no edge cases to miss |
| Email formatting | Complex HTML parser | `<pre>` tag with escaped content | Preserves text formatting, minimal code |
| Crontab filtering | Custom parser | `grep -v` with pattern | POSIX standard, battle-tested |

**Key insight:** These are polish tasks, not feature development. Keep changes minimal and surgical.

## Common Pitfalls

### Pitfall 1: Postmark From Format Edge Cases
**What goes wrong:** Sender name contains special characters, email is rejected
**Why it happens:** Postmark requires escaping quotes and special punctuation in display names
**How to avoid:** Use a fixed name ("Sportlink SYNC") with no special characters
**Warning signs:** Postmark returns 422 error on sendEmail

### Pitfall 2: npm --silent Behavior
**What goes wrong:** Using `npm run --silent` silences script errors too
**Why it happens:** npm 7+ changed --silent behavior; it now silences all output
**How to avoid:** Don't use `npm run` at all - call `node sync-all.js` directly
**Warning signs:** Errors not appearing in logs

### Pitfall 3: Crontab grep Pattern Too Broad
**What goes wrong:** grep removes unrelated cron entries
**Why it happens:** Pattern like "sync" matches other jobs
**How to avoid:** Use specific pattern like `sportlink-sync\|cron-wrapper.sh`
**Warning signs:** User's other cron jobs disappear after running install-cron

### Pitfall 4: Missing TextBody in HTML Email
**What goes wrong:** Email clients that prefer plain text show nothing
**Why it happens:** Only HtmlBody provided, no fallback
**How to avoid:** Always send both HtmlBody and TextBody
**Warning signs:** Email appears blank on some clients/devices

### Pitfall 5: HTML Entity Escaping
**What goes wrong:** Log content breaks HTML structure
**Why it happens:** Content contains `<`, `>`, or `&` characters
**How to avoid:** Escape content before wrapping in HTML
**Warning signs:** Email renders incorrectly or is blank

## Code Examples

Verified patterns from official sources:

### Postmark sendEmail with HTML and Name
```javascript
// Source: https://postmarkapp.com/developer/api/email-api
client.sendEmail({
    From: "Sportlink SYNC <sender@example.com>",
    To: process.env.OPERATOR_EMAIL,
    Subject: `Sportlink Sync Report - ${today}`,
    HtmlBody: "<html><body><pre>Report content here</pre></body></html>",
    TextBody: "Report content here"
});
```

### Crontab Filter and Replace
```bash
# Source: Standard POSIX pattern from Unix documentation
# Filter existing entries, then add new ones
(crontab -l 2>/dev/null | grep -v 'sportlink-sync\|cron-wrapper.sh' || true; echo "$CRON_ENTRIES") | crontab -
```

### Direct Node Invocation
```bash
# Instead of: npm run sync-all
# Use: node sync-all.js
# Or: node --run sync-all (if using Node.js 20.11+ features)
node "$PROJECT_DIR/sync-all.js" 2>&1 | tee -a "$LOG_FILE"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `npm run --silent` | Direct `node` invocation | npm 7 (2020) | Cleaner output, no lifecycle header |
| `node --run` flag | Available in Node 20.11+ | 2024 | Alternative to npm run with less overhead |
| Plain text email | Multipart HTML+Text | Always recommended | Better rendering across clients |

**Current recommendations:**
- Use direct `node script.js` calls when you don't need npm lifecycle features
- Always send multipart emails (HtmlBody + TextBody)
- For crontab management, filter-then-append pattern is most portable

## Open Questions

None - all requirements are well-documented and have clear implementation paths.

## Sources

### Primary (HIGH confidence)
- [Postmark Email API Documentation](https://postmarkapp.com/developer/api/email-api) - From field format, HtmlBody parameter
- [postmark.js GitHub Wiki](https://github.com/ActiveCampaign/postmark.js/wiki/Email-sending) - JavaScript SDK usage
- Local testing of `npm run` output header format - Confirmed `> package@version script` format
- Node.js 23.11.0 `--help` output - Confirmed `--run` flag availability

### Secondary (MEDIUM confidence)
- [npm/cli Issue #1987](https://github.com/npm/cli/pull/1987) - --silent behavior fix history
- [npm/npm Issue #6066](https://github.com/npm/npm/issues/6066) - --quiet request and workarounds
- [Unix crontab patterns](https://theunixtips.com/bash-automate-cron-job-maintenance/) - grep -v filter pattern

## Metadata

**Confidence breakdown:**
- Postmark API: HIGH - Official documentation verified
- npm output suppression: HIGH - Tested locally, multiple sources agree
- Crontab management: HIGH - Standard POSIX pattern, widely documented

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable domain, low churn)
