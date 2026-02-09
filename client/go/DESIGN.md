# Go Client — Design Document

The Go client is the first (reference) implementation of the Tokenly client. It implements the protocol contracts defined in [`specs/07-client-protocol-spec.md`](../../specs/07-client-protocol-spec.md) and the behavioral requirements from specs 01 (launcher) and 02 (worker).

---

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | Go 1.24+ | Static binaries, excellent cross-compilation, native concurrency, strong stdlib |
| Service integration | `kardianos/service` | Battle-tested cross-platform service library (systemd, SCM, launchd) |
| HTTP client | `net/http` (stdlib) | No external dependency needed |
| JSON | `encoding/json` (stdlib) | Sufficient for all protocol messages |
| CLI flags | `flag` (stdlib) or `spf13/cobra` | Cobra if subcommands needed, stdlib otherwise |
| Logging | `log/slog` (stdlib) | Structured JSON logging built into Go 1.21+ |
| File watching | `fsnotify/fsnotify` | Optional — for reactive scanning vs polling |
| Glob matching | `doublestar` | For `**` glob patterns in discovery paths |
| Hashing | `crypto/sha256` (stdlib) | File hashing and dedup hash computation |
| Testing | `testing` (stdlib) + `testify` | Standard Go testing with assertions |
| Build | `go build` + `Makefile` | Simple, reproducible builds |
| CI/CD | GitHub Actions | Cross-platform build matrix |

---

## Project Structure

```
client/go/
├── cmd/
│   ├── launcher/
│   │   └── main.go              → Launcher entry point
│   └── worker/
│       └── main.go              → Worker entry point
├── internal/
│   ├── launcher/
│   │   ├── launcher.go          → Core launcher logic
│   │   ├── heartbeat.go         → Server heartbeat client
│   │   ├── worker_manager.go    → Worker process lifecycle
│   │   ├── updater.go           → Binary update mechanism
│   │   └── service.go           → OS service integration
│   ├── worker/
│   │   ├── worker.go            → Core worker loop
│   │   ├── scanner.go           → File discovery engine
│   │   ├── validator.go         → JSONL validation
│   │   ├── uploader.go          → File upload client
│   │   ├── cleaner.go           → Post-upload cleanup
│   │   └── learner.go           → Learning algorithm
│   ├── ipc/
│   │   ├── server.go            → IPC listener (worker side)
│   │   ├── client.go            → IPC sender (launcher side)
│   │   └── messages.go          → Shared message types
│   ├── config/
│   │   ├── config.go            → Configuration types
│   │   └── state.go             → State file read/write
│   ├── platform/
│   │   ├── paths.go             → Platform-specific paths
│   │   ├── paths_linux.go       → Linux path defaults
│   │   ├── paths_windows.go     → Windows path defaults
│   │   └── paths_darwin.go      → macOS path defaults
│   └── logging/
│       └── logger.go            → Structured JSON logger setup
├── go.mod
├── go.sum
├── Makefile                     → Build, test, lint, cross-compile targets
├── .goreleaser.yml              → (Optional) GoReleaser config for releases
├── DESIGN.md                    → This file
└── README.md                    → Build and development instructions
```

---

## Key Implementation Details

### Launcher Main Loop

```
1. Parse CLI flags (--server, --hostname, --install, --log-level)
2. If --install: register as system service, exit
3. If --uninstall: remove system service, exit
4. Load state file (or create default)
5. Start IPC listener
6. Start heartbeat ticker (interval from config or default 3600s)
7. On each heartbeat tick:
   a. Send heartbeat to server
   b. If 200: apply config, ensure worker is running, check for updates
   c. If 202: ensure worker is stopped (not approved yet)
   d. If 403: ensure worker is stopped, log rejection
   e. If error: increment failure count, backoff
8. Monitor worker process health
9. On SIGTERM/SIGINT: graceful shutdown (stop worker, save state)
```

### Worker Main Loop

```
1. Receive config via IPC start command
2. Load learning data
3. Enter scan loop:
   a. Run discovery (priority paths first, then base paths, then exploratory)
   b. Validate discovered files (age, size, JSONL content)
   c. Queue valid files for upload
   d. Process upload queue (concurrent uploads up to limit)
   e. Clean up successfully uploaded files
   f. Update learning data
   g. Send heartbeat to launcher via IPC
   h. Sleep until next scan interval
4. On stop/shutdown command: finish current upload, save learning data, exit
```

### Platform-Specific Paths (Build Tags)

```go
// paths_linux.go
//go:build linux

package platform

func DataDir() string    { return "/var/lib/tokenly" }
func RunDir() string     { return "/var/run/tokenly" }
func LogDir() string     { return "/var/log/tokenly" }

// paths_windows.go
//go:build windows

package platform

func DataDir() string    { return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly") }
func RunDir() string     { return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly") }
func LogDir() string     { return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly", "logs") }

// paths_darwin.go
//go:build darwin

package platform

func DataDir() string    { return "/Library/Application Support/Tokenly" }
func RunDir() string     { return "/var/run/tokenly" }
func LogDir() string     { return "/var/log/tokenly" }
```

---

## Cross-Compilation Matrix

| Target | GOOS | GOARCH | Binary Name |
|--------|------|--------|-------------|
| Linux x64 | linux | amd64 | tokenly-launcher / tokenly-worker |
| Linux ARM64 | linux | arm64 | tokenly-launcher / tokenly-worker |
| Windows x64 | windows | amd64 | tokenly-launcher.exe / tokenly-worker.exe |
| macOS Intel | darwin | amd64 | tokenly-launcher / tokenly-worker |
| macOS Apple Silicon | darwin | arm64 | tokenly-launcher / tokenly-worker |

---

## Makefile Targets

```makefile
# Core targets
build:          Build launcher and worker for current platform
test:           Run all tests
lint:           Run golangci-lint
fmt:            Format code with gofmt

# Cross-compilation
build-all:      Build for all platforms in the matrix
build-linux:    Build for linux/amd64 and linux/arm64
build-windows:  Build for windows/amd64
build-darwin:   Build for darwin/amd64 and darwin/arm64

# Development
run-launcher:   Build and run launcher in foreground
run-worker:     Build and run worker in foreground
dev:            Run launcher with --log-level debug

# Release
release:        Build all platforms, generate checksums
clean:          Remove build artifacts
```

---

## Build Commands

```bash
# Development build (current platform)
go build -o bin/tokenly-launcher ./cmd/launcher
go build -o bin/tokenly-worker ./cmd/worker

# Cross-compile for Linux x64
GOOS=linux GOARCH=amd64 go build -o bin/tokenly-launcher-linux-x64 ./cmd/launcher
GOOS=linux GOARCH=amd64 go build -o bin/tokenly-worker-linux-x64 ./cmd/worker

# Production build with version info baked in
go build -ldflags "-s -w -X main.version=1.0.0 -X main.commit=$(git rev-parse HEAD)" \
  -o bin/tokenly-launcher ./cmd/launcher
```

---

## Testing Strategy

### Unit Tests

| Package | Test Focus |
|---------|------------|
| `internal/launcher` | Heartbeat parsing, config merging, worker process management |
| `internal/worker` | Scanner filters (age, size, patterns), JSONL validation, learning algorithm |
| `internal/ipc` | Message serialization, command/response round-trips |
| `internal/config` | State file read/write, config merge with overrides |
| `internal/platform` | Path resolution per platform |

### Integration Tests

| Test | Description |
|------|-------------|
| Heartbeat round-trip | Start mock HTTP server, verify heartbeat request/response cycle |
| File upload | Create temp JSONL files, start mock ingest endpoint, verify upload + cleanup |
| IPC communication | Start launcher + worker, verify command/response flow over IPC |
| Learning persistence | Run multiple scan cycles, verify learning.json updates correctly |
| State persistence | Start/stop launcher, verify state.json survives restarts |

### Compliance Tests

Run the shared protocol compliance test suite from `client/protocol/compliance/` against the built Go binaries.

---

## Error Handling Patterns

Go errors follow the standard `error` interface. Key patterns:

```
- Wrap errors with context: fmt.Errorf("heartbeat failed: %w", err)
- Use errors.Is / errors.As for error type checking
- Fatal errors (can't load state, can't bind IPC): log and exit with non-zero code
- Recoverable errors (network timeout, file permission): log, backoff, retry
- Worker crashes: launcher detects via process exit, restarts with backoff
```

---

## Concurrency Model

```
Launcher goroutines:
  1. Main loop (heartbeat ticker)
  2. IPC listener (accept worker connections)
  3. Worker process monitor (wait for exit, restart)
  4. Signal handler (SIGTERM/SIGINT)

Worker goroutines:
  1. Main scan loop
  2. IPC command listener
  3. Upload workers (pool of max_concurrent_uploads)
  4. Signal handler
```

All shared state protected by `sync.Mutex` or channels. No global mutable state.

---

## Dependencies (go.mod)

```
module github.com/ComputClaw/tokenly-client

go 1.24

require (
    github.com/kardianos/service v1.2.2    // Cross-platform service management
    github.com/bmatcuk/doublestar/v4 v4.6  // Glob pattern matching with **
    github.com/stretchr/testify v1.9.0     // Test assertions (test only)
)
```

Minimal dependencies. Prefer stdlib where possible.

---

## Version Embedding

Version info baked into binaries at build time via `-ldflags`:

```go
var (
    version = "dev"
    commit  = "none"
    date    = "unknown"
)
```

Available via `--version` flag:
```
tokenly-launcher version 1.0.0 (commit: abc1234, built: 2026-02-09T10:00:00Z)
```

---

## Development Workflow

```bash
# Prerequisites: Go 1.24+, a running Tokenly server (api/)

# Build
cd client/go
make build

# Run launcher in foreground (dev mode)
./bin/tokenly-launcher --server http://localhost:7071 --log-level debug

# Run tests
make test

# Lint
make lint

# Cross-compile all platforms
make build-all
```

---

## CI/CD Pipeline

```yaml
# .github/workflows/client-go.yml triggers:
# - On push to client/go/**
# - On PR to main touching client/go/**

Jobs:
  test:     Run tests on ubuntu, windows, macos
  lint:     Run golangci-lint
  build:    Cross-compile all platform targets
  release:  (On tag) Build, checksum, create GitHub release with binaries
```
