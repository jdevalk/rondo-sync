# Phase 1: Summary Output - Research

**Researched:** 2026-01-24
**Domain:** Console output formatting and logging in Node.js
**Confidence:** HIGH

## Summary

Node.js provides excellent built-in capabilities for creating clean, structured console output suitable for email delivery. The standard approach for simple logging needs (like this sync script) is to use the native Console class with dual output streams rather than heavy logging frameworks.

For this phase, the recommended approach is:
1. Create a custom Console instance that writes to both stdout and a log file using fs.createWriteStream
2. Use performance.now() for timing (high-resolution, built-in)
3. Structure output with plain text formatting (clear sections, no need for ASCII table libraries for simple summaries)
4. Collect errors during sync and display them in a dedicated section at the end

**Primary recommendation:** Use native Node.js Console class with dual streams (stdout + file) rather than introducing logging library dependencies. This keeps the solution lightweight and perfectly suited for cron job output.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:console | Built-in | Dual-stream output | Native support for writing to multiple streams simultaneously |
| node:fs | Built-in | File writing | createWriteStream with 'a' flag provides efficient append operations |
| node:perf_hooks | Built-in | Duration measurement | High-resolution timing API, stable since Node v12 |
| node:path | Built-in | File path construction | Cross-platform path handling for log files |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chalk | 5.x | Terminal colors | Only if terminal output needs color (not needed for email) |
| cli-table3 | 0.6.x | ASCII tables | Only if complex tabular data needed (overkill for simple summaries) |
| winston | 3.x | Advanced logging | Only for distributed systems or structured JSON logs |
| pino | 9.x | High-performance logging | Only for high-throughput applications (5000+ events/sec) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Console | Winston/Pino | Adds dependencies and complexity for features not needed in simple sync scripts |
| performance.now() | Date.now() | Date.now() can return negative values or zero; performance API is more reliable |
| Custom formatting | cli-table3 | Tables add visual noise in plain text emails; simple formatting is more readable |

**Installation:**
```bash
# No additional packages needed - all native Node.js modules
# Optional if color output desired for terminal:
npm install chalk
```

## Architecture Patterns

### Recommended Project Structure
```
sportlink-sync/
├── logs/                    # Log file directory
│   └── sync-2026-01-24.log # Date-based log files
├── lib/
│   └── logger.js           # Custom logger module
└── [sync scripts].js       # Main scripts using logger
```

### Pattern 1: Dual-Stream Logger
**What:** Create a single logger instance that writes to both stdout and a log file
**When to use:** Any script that needs both terminal output and persistent logging

**Example:**
```javascript
// Source: https://nodejs.org/api/console.html
const fs = require('node:fs');
const { Console } = require('node:console');
const path = require('node:path');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create log file with date-based naming
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const logFile = path.join(logsDir, `sync-${today}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Create logger that outputs to both stdout and file
const logger = new Console({
  stdout: process.stdout,
  stderr: process.stderr
});

// For file-only logging, create separate instance
const fileLogger = new Console({
  stdout: logStream,
  stderr: logStream
});

// Write to both streams
function log(message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);     // To stdout
  fileLogger.log(formatted);  // To file
}
```

### Pattern 2: Duration Tracking
**What:** Measure execution time using performance.now()
**When to use:** Any operation where runtime should be reported to users

**Example:**
```javascript
// Source: https://nodejs.org/api/perf_hooks.html
const { performance } = require('node:perf_hooks');

const startTime = performance.now();

// ... perform sync operation ...

const endTime = performance.now();
const durationMs = endTime - startTime;
const durationSec = (durationMs / 1000).toFixed(2);

console.log(`Sync completed in ${durationSec}s`);
```

### Pattern 3: Error Aggregation
**What:** Collect errors during processing and display in dedicated section at end
**When to use:** Batch operations where individual failures shouldn't halt the entire process

**Example:**
```javascript
const errors = [];

for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    errors.push({
      item: item.id,
      message: error.message
    });
  }
}

// Display errors section only if errors occurred
if (errors.length > 0) {
  console.log('\n' + '='.repeat(50));
  console.log('ERRORS');
  console.log('='.repeat(50));
  errors.forEach(err => {
    console.log(`  ${err.item}: ${err.message}`);
  });
}
```

### Pattern 4: Structured Summary Output
**What:** Organize output with clear sections and dividers for email readability
**When to use:** Any cron job that emails output to users

**Example:**
```javascript
function printSummary(stats) {
  const divider = '='.repeat(60);
  const minorDivider = '-'.repeat(60);

  console.log(divider);
  console.log('SYNC SUMMARY');
  console.log(divider);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Duration: ${stats.duration}s`);
  console.log('');

  console.log('TOTALS');
  console.log(minorDivider);
  console.log(`  Total members processed: ${stats.totalMembers}`);
  console.log(`  Added: ${stats.added}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Removed: ${stats.removed}`);
  console.log('');

  console.log('PER-LIST BREAKDOWN');
  console.log(minorDivider);
  stats.lists.forEach(list => {
    console.log(`  List ${list.index}:`);
    console.log(`    Added: ${list.added}, Updated: ${list.updated}, Removed: ${list.removed}`);
  });
  console.log(divider);
}
```

### Pattern 5: Verbosity Control with Process Args
**What:** Support --verbose flag to control output detail
**When to use:** Scripts that have both summary and detailed output modes

**Example:**
```javascript
const verbose = process.argv.includes('--verbose');

function log(message, level = 'info') {
  if (level === 'verbose' && !verbose) return;
  console.log(message);
}

// Always shown
log('Starting sync...', 'info');

// Only shown with --verbose flag
log('Processing member: john@example.com', 'verbose');
```

### Anti-Patterns to Avoid

- **JSON output for user-facing summaries:** JSON is for machines; use formatted text for humans
- **Logging each item in batch operations (default mode):** Creates noise in email; use summary counts instead, save detail for --verbose
- **Stack traces in normal output:** Keep stack traces in error log files, show only error messages in summaries
- **Using Date.now() for duration:** Can return negative values or zero; use performance.now() instead
- **Creating new file handle for each log line:** Use createWriteStream once, write many times

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log file rotation by date/size | Custom file rotation logic | file-stream-rotator npm package | Handles edge cases like timezone changes, file locking, cleanup |
| Colorized terminal output | ANSI escape code strings | chalk npm package | Cross-platform color support, handles terminal capabilities |
| Complex table formatting | String concatenation + spacing | cli-table3 or console.table() | Automatic column width calculation, alignment, borders |
| Structured logging (JSON) | Custom JSON formatter | winston or pino | Standard formats, log levels, transports, performance optimizations |

**Key insight:** For a simple sync script with summary output, native Node.js console and fs are sufficient. Only add libraries when you need specific features like log rotation, colors, or structured JSON logs. The built-in Console class handles dual-stream output perfectly without dependencies.

## Common Pitfalls

### Pitfall 1: Forgetting to Create Log Directory
**What goes wrong:** fs.createWriteStream throws ENOENT error if logs/ directory doesn't exist
**Why it happens:** createWriteStream doesn't auto-create parent directories
**How to avoid:** Use fs.mkdirSync with { recursive: true } before creating stream
**Warning signs:** "ENOENT: no such file or directory" errors on first run

```javascript
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
```

### Pitfall 2: Stream Not Closed on Exit
**What goes wrong:** Last few log entries may not be written to file
**Why it happens:** Process exits before stream buffer is flushed
**How to avoid:** Close stream explicitly or use process.on('exit') handler
**Warning signs:** Log file missing last few entries

```javascript
process.on('exit', () => {
  if (logStream) {
    logStream.end();
  }
});

process.on('SIGINT', () => {
  if (logStream) {
    logStream.end();
  }
  process.exit(0);
});
```

### Pitfall 3: Using Synchronous File Operations in Loops
**What goes wrong:** Performance degrades significantly with many log writes
**Why it happens:** Each fs.appendFileSync call opens, writes, and closes the file
**How to avoid:** Use fs.createWriteStream once, write many times asynchronously
**Warning signs:** Script takes much longer than expected, high I/O wait times

```javascript
// BAD - opens/closes file each time
logs.forEach(line => fs.appendFileSync('log.txt', line));

// GOOD - opens once, writes many
const stream = fs.createWriteStream('log.txt', { flags: 'a' });
logs.forEach(line => stream.write(line));
stream.end();
```

### Pitfall 4: Not Handling Write Stream Errors
**What goes wrong:** Script continues silently even when logging fails (disk full, permissions)
**Why it happens:** Default Console option ignoreErrors: true suppresses errors
**How to avoid:** Attach error handler to write stream
**Warning signs:** Logs stop appearing but script reports success

```javascript
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
logStream.on('error', (err) => {
  console.error('Log file error:', err.message);
  process.exitCode = 1;
});
```

### Pitfall 5: Logging Verbose Output to Cron Email
**What goes wrong:** Cron sends massive emails with per-item progress messages
**Why it happens:** Didn't implement verbosity levels, everything goes to stdout
**How to avoid:** Make summary mode the default, add --verbose flag for detail
**Warning signs:** Users complain about huge cron emails

```javascript
// Summary mode by default
if (!verbose) {
  console.log(`Processed ${count} members`);
} else {
  // Verbose mode shows each item
  members.forEach(m => console.log(`Processing: ${m.email}`));
}
```

### Pitfall 6: Timestamp Format Inconsistency
**What goes wrong:** Log files have inconsistent date formats, hard to parse
**Why it happens:** Using toLocaleDateString() or custom formats
**How to avoid:** Use ISO 8601 format consistently: new Date().toISOString()
**Warning signs:** Dates look different across log entries

```javascript
// GOOD - consistent, sortable, parseable
const timestamp = new Date().toISOString();
// Output: 2026-01-24T10:30:45.123Z
```

## Code Examples

Verified patterns from official sources:

### Minimal Dual-Output Logger
```javascript
// Source: https://nodejs.org/api/console.html
const fs = require('node:fs');
const { Console } = require('node:console');
const path = require('node:path');

class DualLogger {
  constructor(logDir = 'logs') {
    const logsPath = path.join(process.cwd(), logDir);
    if (!fs.existsSync(logsPath)) {
      fs.mkdirSync(logsPath, { recursive: true });
    }

    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsPath, `sync-${date}.log`);
    this.fileStream = fs.createWriteStream(logFile, { flags: 'a' });

    this.fileStream.on('error', (err) => {
      console.error('Log file error:', err.message);
    });

    // Ensure stream is closed on exit
    process.on('exit', () => this.close());
    process.on('SIGINT', () => {
      this.close();
      process.exit(0);
    });
  }

  log(message) {
    console.log(message);
    this.fileStream.write(message + '\n');
  }

  error(message) {
    console.error(message);
    this.fileStream.write('ERROR: ' + message + '\n');
  }

  close() {
    if (this.fileStream && !this.fileStream.closed) {
      this.fileStream.end();
    }
  }
}

// Usage
const logger = new DualLogger();
logger.log('Sync started');
logger.error('Something went wrong');
```

### Performance Timing
```javascript
// Source: https://nodejs.org/api/perf_hooks.html
const { performance } = require('node:perf_hooks');

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

const startTime = performance.now();
// ... do work ...
const duration = performance.now() - startTime;
console.log(`Completed in ${formatDuration(duration)}`);
```

### Summary Report Structure
```javascript
function printSummary(stats, errors = []) {
  const divider = '='.repeat(60);
  const minorDivider = '-'.repeat(60);

  console.log('');
  console.log(divider);
  console.log('SPORTLINK SYNC SUMMARY');
  console.log(divider);
  console.log(`Started:  ${stats.startTime}`);
  console.log(`Finished: ${stats.endTime}`);
  console.log(`Duration: ${stats.duration}`);
  console.log('');

  console.log('TOTALS');
  console.log(minorDivider);
  console.log(`  Members processed: ${stats.totalProcessed}`);
  console.log(`  Added:             ${stats.totalAdded}`);
  console.log(`  Updated:           ${stats.totalUpdated}`);
  console.log(`  Removed:           ${stats.totalRemoved}`);
  console.log('');

  console.log('PER-LIST BREAKDOWN');
  console.log(minorDivider);
  stats.lists.forEach(list => {
    console.log(`  List ${list.index} (${list.name || 'unnamed'}):`);
    console.log(`    Added:   ${list.added}`);
    console.log(`    Updated: ${list.updated}`);
    console.log(`    Removed: ${list.removed}`);
    console.log('');
  });

  if (errors.length > 0) {
    console.log('ERRORS');
    console.log(minorDivider);
    errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.message}`);
    });
    console.log('');
  }

  console.log(divider);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Callback-based fs methods | fs/promises or streams | Node.js v10 (2018) | Cleaner async code, better performance |
| Date.now() for timing | performance.now() | Node.js v8.5 (2017) | More accurate, monotonic timestamps |
| Custom Console wrapper | Native Console class | Always available | No need for custom dual-output logic |
| Manual log rotation | file-stream-rotator pkg | N/A | Automatic date/size-based rotation |
| winston (heavy config) | Pino (zero-config) | Pino v2 (2017) | 5x faster, simpler for modern apps |

**Deprecated/outdated:**
- **fs callback API:** Still works but fs/promises is now standard (as of Node.js 14+)
- **console.log() color codes:** Use chalk or similar; manual ANSI codes break on some terminals
- **Synchronous file operations in production:** Use streams or async operations for better performance

## Open Questions

Things that couldn't be fully resolved:

1. **Log file retention policy**
   - What we know: Date-based log files will accumulate over time
   - What's unclear: User preference for automatic cleanup vs manual management
   - Recommendation: Start without rotation/cleanup; add if needed in Phase 2 when scheduling is implemented

2. **Error detail level in summary**
   - What we know: User wants "error messages only, not full stack traces"
   - What's unclear: Whether to include error codes, affected items (emails), or just message text
   - Recommendation: Include message + affected item (email) for context; omit stack traces and API response details

3. **Progress output in verbose mode**
   - What we know: --verbose flag should show per-member progress
   - What's unclear: Format of progress (simple counter, progress bar, full details)
   - Recommendation: Simple counter format "Processing 5/100: john@example.com" - readable in both terminal and email

## Sources

### Primary (HIGH confidence)
- Node.js Console API - https://nodejs.org/api/console.html
- Node.js Performance Hooks API - https://nodejs.org/api/perf_hooks.html
- Node.js File System API - https://nodejs.org/api/fs.html
- Current project code - submit-laposta-list.js, show-laposta-changes.js

### Secondary (MEDIUM confidence)
- [Pino vs Winston comparison](https://betterstack.com/community/comparisons/pino-vs-winston/) - Library comparison
- [Best Practices for Node.js Logging 2026](https://forwardemail.net/en/blog/docs/best-practices-for-node-js-logging) - General logging guidance
- [Node.js Performance API Guide](https://betterstack.com/community/guides/scaling-nodejs/performance-apis/) - Performance timing patterns
- [fs.createWriteStream documentation](https://www.geeksforgeeks.org/node-js/node-js-fs-createwritestream-method/) - Stream usage

### Tertiary (LOW confidence)
- [ASCII table libraries comparison](https://npm-compare.com/ascii-table,blessed,cli-table,cli-table3,table) - Package options (not verified for current versions)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All built-in Node.js modules, verified in official documentation
- Architecture: HIGH - Patterns from official Node.js docs and existing project code
- Pitfalls: HIGH - Common issues verified through official docs and established best practices

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable domain, built-in APIs change slowly)
