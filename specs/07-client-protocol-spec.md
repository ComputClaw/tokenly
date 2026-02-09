# Component Specification: Client Protocol

## Overview

This specification defines the **language-agnostic protocol contracts** that any Tokenly client implementation must satisfy to interoperate with the server. It covers wire formats, file schemas, IPC conventions, CLI interface, and compliance testing.

The behavioral requirements for the client are defined in:
- [01-client-launcher-spec.md](01-client-launcher-spec.md) — Launcher behavior, service integration, update mechanism
- [02-client-worker-spec.md](02-client-worker-spec.md) — Worker behavior, discovery engine, upload pipeline, learning algorithm

This document focuses on the **interoperability contracts** between client and server.

---

## Multi-Client Architecture

Multiple client implementations can coexist. Each lives in its own directory and must satisfy the contracts below.

```
client/
├── protocol/                  → Language-agnostic test fixtures
│   ├── fixtures/              → Test fixtures for compliance testing
│   │   ├── valid-usage.jsonl
│   │   ├── invalid-usage.jsonl
│   │   ├── mixed-usage.jsonl
│   │   └── heartbeat-responses/
│   │       ├── approved.json
│   │       ├── pending.json
│   │       └── rejected.json
│   └── compliance/            → Compliance test scripts (curl/httpie based)
├── go/                        → Go client (first implementation)
├── rust/                      → (Future) Rust client
└── node/                      → (Future) Node.js/TypeScript client
```

---

## Protocol Contracts

### 1. Heartbeat Protocol

**Endpoint:** `POST {server}/api/heartbeat`

**Request contract:**
```json
{
  "client_hostname": "string, required — machine hostname",
  "timestamp": "string, required — ISO 8601 UTC",
  "launcher_version": "string, required — semver",
  "worker_version": "string, required — semver",
  "worker_status": "string, required — one of: running, pending, stopped, crashed",
  "system_info": {
    "os": "string, required — one of: linux, windows, darwin",
    "arch": "string, required — one of: x64, arm64",
    "platform": "string, optional — OS distribution detail"
  },
  "stats": {
    "files_uploaded_today": "integer, optional",
    "last_scan_time": "string, optional — ISO 8601 UTC",
    "directories_monitored": "integer, optional",
    "errors_since_last_heartbeat": "integer, optional"
  }
}
```

**Response handling:**

| HTTP Status | Meaning | Required Client Behavior |
|-------------|---------|--------------------------|
| 200 | Approved | Parse config + update sections. Apply config to worker. Start/continue scanning. |
| 202 | Pending approval | Wait `retry_after_seconds` before next heartbeat. Do not scan. |
| 403 | Rejected | Stop all operations. Log error. Continue heartbeating at reduced interval (1hr). |
| 5xx / network error | Server unavailable | Exponential backoff (min 60s, max 3600s). Continue worker with last known config. |

---

### 2. Ingestion Protocol

**Endpoint:** `POST {server}/api/ingest`

**Request contract:** `multipart/form-data` with two parts:

Part 1 — `metadata` (JSON):
```json
{
  "client_hostname": "string, required",
  "collected_at": "string, required — ISO 8601 UTC",
  "file_info": {
    "original_path": "string, required",
    "directory": "string, required",
    "filename": "string, required",
    "size_bytes": "integer, required",
    "modified_at": "string, required — ISO 8601 UTC",
    "line_count": "integer, required"
  }
}
```

Part 2 — `file` (binary): The raw JSONL file contents with original filename.

**Response handling:**

| HTTP Status | Action |
|-------------|--------|
| 200 | Delete local file. Update learning data. |
| 400 | Do NOT delete file. Remove from queue. Log warning. |
| 401/403 | Stop uploads. Report to launcher. |
| 413 | Remove from queue. Log warning. |
| 429 | Requeue with delay from `Retry-After` header. |
| 5xx / network error | Requeue with exponential backoff. |

---

### 3. JSONL Validation Contract

A file is valid for upload when:
1. File age is within `max_file_age_hours` (from modification time)
2. File size is within `max_file_size_mb`
3. At least 50% of non-empty lines parse as valid JSON objects
4. Valid records must have: `timestamp` (RFC 3339), `service` (non-empty string), `model` (non-empty string)
5. Optional field validation: `input_tokens` and `output_tokens` must be non-negative and ≤ 1,000,000

---

### 4. State File Contract

**Location:**
- Linux: `/var/lib/tokenly/tokenly-state.json`
- Windows: `%PROGRAMDATA%\Tokenly\tokenly-state.json`
- macOS: `/Library/Application Support/Tokenly/tokenly-state.json`

**Schema:** See spec 01, section "Runtime State File". All implementations must read/write the same schema so state survives a client language swap.

---

### 5. Learning File Contract

**Location:** Same directory as state file, named `tokenly-learning.json`.

**Schema:** See spec 02, section "Learning Data Model". All implementations must read/write the same schema.

---

### 6. IPC Contract (Launcher ↔ Worker)

**Mechanism:**
- Linux/macOS: Unix domain socket at `/var/run/tokenly/worker.sock`
- Windows: Named pipe at `\\.\pipe\tokenly-worker`

**Message format:** Newline-delimited JSON (one JSON object per line).

**Commands (launcher → worker):** `start`, `stop`, `restart`, `status`, `shutdown`, `update_config`
**Responses (worker → launcher):** `started`, `stopped`, `config_updated`, `status`, `error`, `heartbeat`

See specs 01 and 02 for full message schemas.

---

### 7. Service Integration Contract

| Platform | Mechanism | Service Name | User |
|----------|-----------|--------------|------|
| Linux | systemd | `tokenly` | `tokenly` (dedicated) |
| Windows | SC Manager | `Tokenly` | LocalSystem or dedicated |
| macOS | launchd | `com.tokenly.launcher` | root (daemon) |

**CLI contract:**
```
tokenly-launcher --server <url>              # Run in foreground
tokenly-launcher --server <url> --install    # Install as system service
tokenly-launcher --server <url> --uninstall  # Remove system service
tokenly-launcher --hostname <name>           # Override hostname
tokenly-launcher --log-level <level>         # Override log level
tokenly-launcher --version                   # Print version
```

---

### 8. Binary Naming Contract

Binaries follow this naming convention for distribution:
```
tokenly-launcher-{version}-{os}-{arch}[.exe]
tokenly-worker-{version}-{os}-{arch}[.exe]
```

Examples:
```
tokenly-launcher-1.0.0-linux-x64
tokenly-launcher-1.0.0-windows-x64.exe
tokenly-launcher-1.0.0-darwin-arm64
tokenly-worker-1.0.0-linux-x64
```

---

### 9. Logging Contract

All implementations must emit structured JSON logs to stderr:
```json
{
  "timestamp": "ISO 8601 UTC",
  "level": "DEBUG|INFO|WARN|ERROR|FATAL",
  "component": "launcher|worker",
  "message": "Human-readable message",
  "data": {}
}
```

---

### 10. Compliance Test Suite

The `client/protocol/compliance/` directory contains shell scripts that validate any client implementation against the protocol contracts. A compliant client must pass all compliance tests.

**Test categories:**
- `heartbeat-*.sh` — Heartbeat request/response contract
- `ingest-*.sh` — Upload request/response contract
- `state-*.sh` — State file read/write contract
- `learning-*.sh` — Learning file read/write contract
- `cli-*.sh` — CLI argument contract
- `service-*.sh` — Service install/uninstall contract

---

## Adding a New Client Implementation

To add a client in a new language:

1. Create `client/{language}/` directory
2. Implement the protocol contracts above
3. Ensure state file and learning file compatibility (same JSON schemas)
4. Ensure binary naming follows the convention
5. Run the shared compliance test suite from `client/protocol/compliance/`
6. Add a `DESIGN.md` with implementation-specific details (tech choices, project structure, build system)

The protocol contracts and shared test fixtures ensure any implementation is interchangeable.

---

This specification provides the interoperability foundation for implementing Tokenly clients in any language.
