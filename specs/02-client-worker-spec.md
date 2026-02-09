# Component Specification: Client Worker

## Overview

The Client Worker is the core discovery and collection engine of Tokenly. It intelligently scans for JSONL files containing token usage data, processes and validates them, uploads to the server, and cleans up local files. The worker operates as a managed process under the Client Launcher and receives all configuration via server heartbeat responses.

**Design Philosophy:**
- **Smart discovery** - Learn from successful file locations to optimize future scans
- **Platform awareness** - Adapt behavior for Windows, Linux, and macOS differences
- **Resilient operation** - Handle network failures, file locks, and permission issues
- **Zero configuration** - All settings come from launcher via server heartbeat
- **Efficient scanning** - Minimize disk I/O and CPU usage during discovery

---

## Responsibilities

### Primary Functions
1. **File Discovery** - Intelligent scanning for JSONL files across platform-specific locations
2. **Learning Algorithm** - Remember successful discovery paths and adapt scanning patterns
3. **File Processing** - Validate JSONL structure, extract metadata, prepare for upload
4. **Data Upload** - Reliable file transmission to server with retry logic
5. **Local Cleanup** - Delete uploaded files and remove empty directories
6. **Error Recovery** - Handle failures gracefully with appropriate retry strategies

### Secondary Functions
7. **Status Reporting** - Communicate progress and errors to launcher
8. **Configuration Updates** - Apply new settings from server without restart
9. **Performance Optimization** - Minimize resource usage and scan time
10. **Logging** - Detailed operation logs for troubleshooting

---

## Architecture

### Process Model
```
Client Launcher (parent process)
    ↓ spawns and manages
Client Worker (child process)
    ↓ communicates via
IPC Channel (commands, status, progress)
```

### Operational Cycle
```
1. Start → Receive Config → Initialize Discovery Engine
         ↓
2. Smart Scan → Find JSONL Files → Validate Age/Size
         ↓
3. Process Files → Extract Metadata → Queue for Upload
         ↓
4. Upload Files → Retry on Failure → Confirm Success
         ↓
5. Cleanup → Delete Files → Remove Empty Dirs → Update Learning
         ↓
6. Sleep → Wait for Next Scan Interval → Repeat
```

---

## Configuration (Received from Launcher)

### Worker Configuration Structure
```json
{
  "scan_enabled": true,
  "scan_interval_minutes": 60,
  "max_file_age_hours": 24,
  "max_file_size_mb": 10,
  "worker_timeout_seconds": 30,
  "max_concurrent_uploads": 3,
  "discovery_paths": {
    "linux": ["/var/log", "/opt/*/logs", "/home/*/logs"],
    "windows": ["%APPDATA%/logs", "%PROGRAMDATA%/logs"],
    "darwin": ["/var/log", "/usr/local/var/log"]
  },
  "file_patterns": ["*.jsonl", "*token*.log", "*usage*.log"],
  "exclude_patterns": ["*temp*", "*cache*", "*backup*"],
  "retry_failed_uploads": true,
  "retry_delay_seconds": 300,
  "retry_max_attempts": 3,
  "log_level": "info"
}
```

---

## Smart Discovery Engine

### Discovery Strategy

#### Phase 1: Initial Discovery
1. Get platform-specific base paths from config
2. Expand wildcards and environment variables
3. Check directory permissions and accessibility
4. Scan recursively for matching file patterns
5. Filter by exclude patterns
6. Apply age and size restrictions

#### Phase 2: Learning and Optimization
1. Track success rate per directory path
2. Remember directories that frequently contain files
3. Prioritize high-success directories in future scans
4. Adapt scan depth based on historical findings
5. Cache negative results to avoid repeated failed scans

### Platform-Specific Discovery Paths

| Platform | Typical Paths | Notes |
|----------|---------------|-------|
| Linux | `/var/log`, `/opt/*/logs`, `/home/*/logs`, `/usr/local/var/log`, `/var/lib/*/logs`, `/tmp/logs` | Check read permissions before scanning; respect Unix file permissions |
| Windows | `%APPDATA%/logs`, `%PROGRAMDATA%/logs`, `%LOCALAPPDATA%/logs`, `C:/logs`, `%PROGRAMFILES%/*/logs`, `%TEMP%/logs` | Expand environment variables; handle file locks from other processes with retry |
| macOS | `/var/log`, `/usr/local/var/log`, `/opt/homebrew/var/log`, `/Library/Logs`, `~/Library/Logs`, `/Applications/*/logs` | May require Full Disk Access for `~/Library`; detect Apple Silicon Homebrew paths |

### Platform-Specific Behavior

**Directory scanning algorithm:**
1. Check if path exists; skip silently if not
2. Check read permissions; log warning and skip if denied
3. Scan recursively up to configured max depth
4. Match files against configured patterns
5. Exclude files matching exclude patterns
6. Filter by age (only files modified within `max_file_age_hours`)
7. Filter by size (only files smaller than `max_file_size_mb`)

**Windows file lock handling:**
- When a file cannot be opened because another process holds a lock, retry after a short delay (e.g., 1 second)
- After 3 retries, skip the file and log a warning
- Re-attempt on the next scan cycle

### Learning Algorithm

#### Learning Data Model

The worker persists learning data to a local file (`tokenly-learning.json`) so knowledge survives restarts.

```json
{
  "directories": {
    "/var/log/openai": {
      "path": "/var/log/openai",
      "scan_count": 15,
      "file_count": 42,
      "last_success": "2026-02-09T08:00:00Z",
      "success_rate": 2.8,
      "avg_files_per_scan": 2.8
    },
    "/opt/app/logs": {
      "path": "/opt/app/logs",
      "scan_count": 15,
      "file_count": 0,
      "last_success": null,
      "success_rate": 0.0,
      "avg_files_per_scan": 0.0
    }
  },
  "negative_cache": ["/tmp/logs", "/opt/app/logs"],
  "last_updated": "2026-02-09T09:00:00Z"
}
```

**Field descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Directory path being tracked |
| `scan_count` | integer | Total number of times this path has been scanned |
| `file_count` | integer | Total number of files found across all scans |
| `last_success` | datetime? | Timestamp of last scan that found at least one file |
| `success_rate` | float | `file_count / scan_count` |
| `avg_files_per_scan` | float | Same as success_rate (average files found per scan) |
| `negative_cache` | string[] | Paths that have never yielded files after 5+ scans |

#### Learning Update Algorithm

After each scan of a directory:
1. Increment `scan_count`
2. Add discovered file count to `file_count`
3. If files were found: update `last_success`, remove path from `negative_cache`
4. If no files found and `scan_count >= 5` and `file_count == 0`: add to `negative_cache`
5. Recalculate `success_rate` and `avg_files_per_scan`

#### Priority Scoring

To determine scan order, score each directory:
- `score = success_rate * recency_multiplier(last_success)`
- `recency_multiplier`: 1.0 if last success was within 24 hours, decaying toward 0.1 over 30 days
- Sort directories by score descending; scan highest-scoring first

#### Adaptive Scanning Algorithm

Each scan cycle proceeds in three phases:

1. **Priority paths** — Scan learned high-scoring directories first (skip those in negative cache)
2. **Base paths** — Scan all configured platform paths not already covered in phase 1
3. **Exploratory paths** — With ~10% probability, try new/uncommon paths to discover new file sources

---

## File Processing Pipeline

### File Candidate Data Model

A discovered file before validation:

```json
{
  "path": "/var/log/openai/usage.jsonl",
  "size_bytes": 847392,
  "modified_at": "2026-02-08T10:30:00Z",
  "estimated_lines": 1205
}
```

### Processed File Data Model

A validated file ready for upload:

```json
{
  "path": "/var/log/openai/usage.jsonl",
  "metadata": {
    "original_path": "/var/log/openai/usage.jsonl",
    "directory": "/var/log/openai",
    "filename": "usage.jsonl",
    "size_bytes": 847392,
    "modified_at": "2026-02-08T10:30:00Z",
    "created_at": "2026-02-08T10:30:00Z",
    "line_count": 1205,
    "file_hash": "a1b2c3d4e5f6..."
  },
  "valid_records": 1203,
  "invalid_records": 2,
  "processing_time_ms": 145
}
```

### File Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `original_path` | string | Full original file path |
| `directory` | string | Parent directory |
| `filename` | string | File name only |
| `size_bytes` | integer | File size in bytes |
| `modified_at` | datetime | Last modification time |
| `created_at` | datetime | Creation time (same as modified_at on platforms that don't expose creation time) |
| `line_count` | integer | Total number of lines |
| `file_hash` | string | SHA-256 hash of file contents (for deduplication) |

### JSONL Validation Algorithm

1. Open the file for reading
2. Read line by line
3. Skip empty lines
4. For each non-empty line: attempt to parse as JSON object
5. If parse fails: increment invalid record count, log at DEBUG level, continue
6. If parse succeeds: validate that required fields are present (see below)
7. After processing all lines, check: at least 50% of records must be valid
8. If less than 50% valid: reject the file (do not upload)

**Required fields in a token usage record:**
- `timestamp` — Must be a valid RFC 3339 datetime string
- `service` — Must be a non-empty string
- `model` — Must be a non-empty string

**Optional field validation:**
- `input_tokens` — If present, must be a non-negative number ≤ 1,000,000
- `output_tokens` — If present, must be a non-negative number ≤ 1,000,000

### Metadata Extraction

For each validated file:
1. Read file stats (size, modification time)
2. Calculate SHA-256 hash of the full file contents (using streaming/buffered reads)
3. Count total lines
4. Return metadata object

---

## Upload Management

### Upload Task Data Model

```json
{
  "file_path": "/var/log/openai/usage.jsonl",
  "metadata": { "..." },
  "attempt_count": 0,
  "last_attempt": null,
  "next_retry": null,
  "error_history": []
}
```

### Upload Behavior

**For each file in the upload queue:**

1. Check if retry delay has elapsed (skip if `next_retry` is in the future)
2. Check if max retry attempts exceeded — if so, mark as permanently failed and remove from queue
3. Increment `attempt_count`, set `last_attempt` to now
4. Prepare HTTP multipart/form-data request:
   - Part 1: `metadata` field (JSON string with file metadata)
   - Part 2: `file` field (file contents with original filename)
5. Send POST request to `{server}/api/v1/ingest` with client ID header
6. Handle response:

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 OK | Upload accepted | Delete local file, update learning data |
| 400 Bad Request | File permanently rejected by server | Remove from queue, do NOT delete file, log warning |
| 401/403 | Authentication failure | Stop uploads, report error to launcher |
| 413 | File too large | Remove from queue, log warning |
| 429 | Rate limited | Requeue with backoff based on `Retry-After` header |
| 5xx | Server error | Requeue with exponential backoff |
| Network error | Connection failure | Requeue with exponential backoff |

### Retry Strategy

| Attempt | Delay | Notes |
|---------|-------|-------|
| 1 | `retry_delay_seconds` (default 300s) | First retry |
| 2 | `retry_delay_seconds * 2` | Second retry |
| 3 | `retry_delay_seconds * 3` | Final attempt |
| 4+ | N/A | Mark as failed, remove from queue |

### Upload Queue Processing

1. Process queue items up to `max_concurrent_uploads` at a time
2. For each item: attempt upload, handle result
3. On success: clean up local file (see Cleanup Operations)
4. On temporary failure: schedule retry and put back in queue
5. On permanent failure: remove from queue, log error
6. Report upload statistics to launcher via IPC heartbeat

### Cleanup Operations

After a successful upload:
1. Delete the uploaded file
2. Check if the parent directory is now empty
3. If empty: remove the directory
4. Recursively check parent directories and remove them if empty
5. Stop recursion at filesystem root or if directory is not empty or cannot be removed

**Safety rules:**
- Never remove directories that are at the root level (`/`, `C:\`)
- Never remove directories that are in the configured discovery path list
- Log each removal at INFO level for auditability

---

## Communication with Launcher

### IPC Command Types

**Commands (Launcher → Worker):**

| Command | Payload | Description |
|---------|---------|-------------|
| `start` | `config` object | Start scanning with provided configuration |
| `stop` | — | Stop current operation gracefully |
| `restart` | — | Stop then start with current config |
| `update_config` | `config` object | Apply new configuration without restart |
| `get_status` | — | Request current status |
| `shutdown` | — | Graceful shutdown |

**Responses (Worker → Launcher):**

| Type | Fields | Description |
|------|--------|-------------|
| `started` | `message` | Worker started successfully |
| `stopped` | `message` | Worker stopped gracefully |
| `config_updated` | `message` | Configuration applied |
| `status` | `state`, `last_scan`, `files_processed_today`, `upload_queue_size`, `errors_today` | Current worker status |
| `error` | `message`, `fatal` | Error report (fatal = worker must stop) |
| `heartbeat` | `files_found`, `files_uploaded`, `scan_duration_ms` | Periodic scan results |

### Worker States

| State | Description |
|-------|-------------|
| `starting` | Initializing, loading learning data |
| `scanning` | Actively scanning directories for files |
| `processing` | Validating and preparing discovered files |
| `uploading` | Uploading files to server |
| `idle` | Waiting for next scan interval |
| `error` | Encountered an error (may recover) |
| `stopping` | Shutting down gracefully |

### Status Reporting Flow

During each scan cycle, the worker sends status updates at each phase transition:
1. Enter `scanning` → send status with current stats
2. Enter `processing` → send status with discovered file count
3. Enter `uploading` → send status with queue size
4. Complete cycle → send `heartbeat` with summary

---

## Error Handling and Recovery

### Error Categories

| Category | Examples | Recovery Action |
|----------|----------|-----------------|
| **Scan: Permission Denied** | Cannot read directory, file access denied | Add to negative cache, continue scanning other paths |
| **Scan: Path Not Found** | Directory does not exist | Skip silently, continue scanning |
| **Scan: I/O Error** | Disk read failure, timeout | Log warning, continue scanning other paths |
| **Scan: Pattern Error** | Invalid glob pattern in config | Log error, skip that pattern |
| **Processing: Invalid Format** | File is not valid JSONL | Skip file, log warning |
| **Processing: Insufficient Records** | Less than 50% of records valid | Skip file, log warning |
| **Processing: File Too Large** | Exceeds `max_file_size_mb` | Skip file, log warning |
| **Processing: File Too Old** | Older than `max_file_age_hours` | Skip file (do not upload stale data) |
| **Upload: Network Error** | Connection timeout, DNS failure | Retry with exponential backoff |
| **Upload: Temporary Failure** | Server 5xx, rate limited | Retry with backoff |
| **Upload: Permanent Failure** | Server 400, invalid payload | Do not retry, log error |
| **Upload: Auth Failure** | Server 401/403 | Stop uploads, report to launcher |
| **Configuration Error** | Invalid config from launcher | Stop worker, report fatal error |

### Error Handling Strategy

For each error encountered:
1. Classify into one of the categories above
2. Apply the prescribed recovery action
3. Increment daily error counter
4. Log at appropriate level (DEBUG for skips, WARN for retries, ERROR for failures)
5. Send error report to launcher if fatal

---

## Performance Optimization

### Resource Limits

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_scan_depth` | 10 | Maximum directory recursion depth |
| `max_files_per_scan` | 1000 | Stop discovery after finding this many files |
| `scan_timeout_seconds` | 300 | Maximum time for a single scan cycle |
| `io_buffer_size` | 8192 | Buffer size for file reads (bytes) |
| `concurrent_file_processing` | 4 | Maximum files processed in parallel |

### Scanning Optimization

1. Enforce scan timeout — stop discovery if `scan_timeout_seconds` elapsed
2. Enforce file limit — stop discovery after `max_files_per_scan` files found
3. Process priority paths first (from learning algorithm) to maximize yield within limits
4. Sort discovered files by modification time (oldest first) to process aging data promptly

### Memory Management

- Process files concurrently up to `concurrent_file_processing` limit
- Use streaming/buffered I/O for file reading (avoid loading entire files into memory)
- Hash files in chunks using `io_buffer_size` buffer

---

## Testing Strategy

### Test Scenarios

#### File Discovery Tests

| Scenario | Setup | Expected Result |
|----------|-------|-----------------|
| Valid JSONL files in configured paths | Create test JSONL files in temp directories | All files discovered and returned |
| Files exceeding max age | Set file modification time to > `max_file_age_hours` ago | Files filtered out |
| Files exceeding max size | Create file larger than `max_file_size_mb` | File filtered out |
| Permission denied on directory | Set unreadable permissions on directory | Directory skipped, warning logged |
| Empty directories | Create directories with no matching files | No files returned, no errors |
| Nested directory discovery | Place files at various depths | Files found up to `max_scan_depth` |

#### JSONL Validation Tests

| Scenario | Input | Expected Result |
|----------|-------|-----------------|
| All valid records | JSONL with valid `timestamp`, `service`, `model` fields | All records marked valid |
| Mixed valid/invalid | 60% valid, 40% invalid lines | File accepted (above 50% threshold) |
| Mostly invalid | 30% valid, 70% invalid lines | File rejected |
| Missing required field | Records without `timestamp` | Those records marked invalid |
| Invalid timestamp format | Non-RFC3339 timestamp | Record marked invalid |
| Suspicious token counts | `input_tokens > 1,000,000` | Record marked invalid |
| Empty file | 0 bytes | File rejected |

#### Learning Algorithm Tests

| Scenario | Setup | Expected Result |
|----------|-------|-----------------|
| Successful scan updates stats | Scan path with files | `scan_count` incremented, `file_count` updated, `last_success` set |
| Negative cache after 5 empty scans | Scan same empty path 5 times | Path added to `negative_cache` |
| Files found removes from negative cache | Path in negative cache, then files found | Path removed from negative cache |
| Priority ordering | Paths with different success rates | Higher success rate paths scanned first |

#### Upload Tests

| Scenario | Server Response | Expected Result |
|----------|-----------------|-----------------|
| Successful upload | 200 OK | File deleted, stats updated |
| Server rejects file | 400 Bad Request | File kept, removed from queue |
| Server error | 500 Internal Server Error | File requeued with backoff |
| Network timeout | Connection timeout | File requeued with backoff |
| Max retries exceeded | 3 consecutive failures | File removed from queue, logged as failed |
| Auth failure | 401 Unauthorized | Uploads stopped, error reported to launcher |

---

## Deployment and Monitoring

### Binary Distribution
- **Single executable** - Worker is distributed with launcher as initial binary
- **Cross-platform** - Linux (x64, ARM64), Windows (x64), macOS (Intel, Apple Silicon)
- **Minimal dependencies** - Statically linked for portability
- **Version compatibility** - Worker reports version to launcher for update coordination

### Logging and Observability

Worker emits structured JSON logs (same format as launcher):

```json
{
  "timestamp": "2026-02-09T09:45:00Z",
  "level": "INFO",
  "component": "worker",
  "message": "Scan cycle complete",
  "data": {
    "files_discovered": 5,
    "files_uploaded": 3,
    "upload_queue_size": 2,
    "known_paths": 12,
    "blocked_paths": 3,
    "errors_today": 1,
    "scan_duration_ms": 2500,
    "avg_files_per_scan": 3.2
  }
}
```

### Performance Metrics
- **Scan efficiency** - Files found per minute of scanning
- **Upload throughput** - Bytes uploaded per second
- **Learning effectiveness** - Success rate improvement over time
- **Error rates** - Permission errors, network failures, processing errors
- **Resource usage** - CPU, memory, disk I/O during operations

---

This specification provides a comprehensive foundation for implementing an intelligent, resilient Client Worker that can efficiently discover and upload JSONL token usage files while learning and adapting to each deployment environment.
