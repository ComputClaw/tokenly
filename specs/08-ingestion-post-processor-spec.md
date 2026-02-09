# Component Specification: Ingestion Post-Processor

## Overview

The Ingestion Post-Processor is a background process that parses and validates raw JSONL files stored during ingestion. The ingest endpoint stores files as-is for fast acceptance; this component handles the heavy lifting of parsing, validation, and record storage on a timer.

**Design Philosophy:**
- **Decouple ingestion from processing** — Clients get fast responses; parsing happens asynchronously
- **Reliable** — Failed files are retained for diagnostics, not silently dropped
- **Idempotent** — Re-processing a file produces the same result
- **Observable** — Processing status is visible via the admin interface

---

## Responsibilities

1. **File retrieval** — Pick up raw files with `pending` status from the Token Storage Plugin
2. **JSONL parsing** — Parse file content line by line into JSON objects
3. **Record validation** — Validate each record against the required field contract
4. **Validity threshold** — Enforce the 50% validity rule (reject files where fewer than 50% of non-empty lines are valid)
5. **Record storage** — Store valid records via `storeUsageRecords`
6. **Status tracking** — Update raw file status to `processed` or `failed` with processing results
7. **Client statistics** — Update client record counts after successful processing

---

## Processing Flow

```
1. Query Token Storage Plugin for pending raw files (getPendingRawFiles)
2. For each file:
   a. Set status to `processing` (updateRawFileStatus)
   b. Read raw file content as text
   c. Split into non-empty lines
   d. For each line:
      - Attempt JSON parse
      - If parse fails: count as invalid
      - If parse succeeds: validate required fields
   e. Apply 50% validity rule:
      - If valid lines < 50% of total non-empty lines → mark file as `failed`
      - Otherwise → continue
   f. Store valid records via storeUsageRecords (with client_id from metadata)
   g. Set status to `processed` with processing result
   h. Update client statistics (total_records)
3. On error during processing:
   - Set status to `failed` with error details
   - Continue to next file
```

---

## Record Validation Rules

A parsed JSON object is a valid record when:

| Field | Rule |
|-------|------|
| `timestamp` | Required. Must be a non-empty string in RFC 3339 format. |
| `service` | Required. Must be a non-empty string. |
| `model` | Required. Must be a non-empty string. |
| `input_tokens` | Optional. If present, must be a non-negative integer ≤ 1,000,000. |
| `output_tokens` | Optional. If present, must be a non-negative integer ≤ 1,000,000. |

All other fields (`cost_usd`, `session_id`, `request_id`, `user_id`, `application`, `environment`, `metadata`) are optional and passed through without validation.

---

## 50% Validity Rule

A file is rejected if fewer than 50% of its non-empty lines parse as valid records (valid JSON with required fields present and valid). This prevents storing garbage data from corrupted or misidentified files.

When a file fails the validity check:
- Status is set to `failed`
- Processing result includes the validity ratio and sample errors
- No records from the file are stored
- The raw file is retained for admin review

---

## Scheduling

The post-processor runs on a timer. Recommended interval: **every 1–5 minutes** depending on volume.

Each run processes a configurable batch of pending files (default: 10). If more files remain, they are picked up on the next run.

---

## Processing Result

Attached to the raw file after processing:

```json
{
  "records_processed": 1205,
  "records_stored": 1203,
  "records_duplicate": 0,
  "records_invalid": 2,
  "validity_ratio": 0.998,
  "processing_time_ms": 145,
  "processed_at": "2026-02-09T09:50:00Z",
  "errors": [
    "Line 47: missing required field 'service'",
    "Line 892: invalid JSON"
  ]
}
```

For failed files:

```json
{
  "records_processed": 100,
  "records_stored": 0,
  "records_invalid": 60,
  "validity_ratio": 0.40,
  "processing_time_ms": 25,
  "processed_at": "2026-02-09T09:50:00Z",
  "failure_reason": "Below 50% validity threshold (40.0% valid)",
  "errors": ["...sample errors..."]
}
```

---

## Dependencies

| Component | Interface Used |
|-----------|---------------|
| Token Storage Plugin | `getPendingRawFiles`, `updateRawFileStatus`, `storeUsageRecords` |
| Admin Storage Plugin | `updateClient` (for client statistics) |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File parsing throws unexpected error | Mark file as `failed`, log error, continue to next file |
| Token storage unavailable | Stop current run, retry on next timer tick |
| Single record fails validation | Count as invalid, continue parsing remaining lines |
| All records invalid (0% validity) | Mark file as `failed` with reason |
| Duplicate records detected by storage | Counted in `records_duplicate`, not an error |

---

## Testing Strategy

| Test Scenario | Input | Expected Outcome |
|---------------|-------|-----------------|
| All valid lines | File with 100% valid JSONL | Status `processed`, all records stored |
| Mixed valid/invalid (above 50%) | 70% valid, 30% invalid | Status `processed`, valid records stored, invalid counted |
| Below 50% threshold | 40% valid, 60% invalid | Status `failed`, no records stored |
| Empty file | 0 non-empty lines | Status `failed` (no records to process) |
| Unparseable lines | Non-JSON text lines | Counted as invalid, validity rule applied |
| Duplicate records | Same records submitted twice | First batch stored, second batch shows duplicates |
| Processing error | Storage write fails mid-file | Status `failed`, error details attached |
| Idempotent reprocessing | Re-process already-processed file | Same result (duplicates detected by storage) |
