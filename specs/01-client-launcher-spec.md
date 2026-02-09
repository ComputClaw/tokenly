# Component Specification: Client Launcher

## Overview

The Client Launcher is a small, stable service that acts as the system-level interface for Tokenly clients. It manages the Worker process lifecycle, handles communication with the Tokenly server, and provides reliable update capabilities without requiring service restarts.

**Design Philosophy:**
- **Stability over features** - Minimal, rarely-changing codebase
- **Platform native** - Proper OS service integration
- **Zero-downtime updates** - Worker updates without service interruption
- **Resilient communication** - Robust error handling and retry logic

---

## Responsibilities

### Primary Functions
1. **Service Management** - Register and run as system service/daemon
2. **Worker Lifecycle** - Start, stop, restart, and monitor worker process
3. **Server Communication** - Handle heartbeats and receive server instructions
4. **Update Orchestration** - Download, verify, and install worker updates
5. **Configuration Management** - Maintain client settings and server endpoint
6. **Error Recovery** - Restart failed workers, handle network interruptions

### Secondary Functions
7. **Logging** - Structured logging for debugging and monitoring
8. **State Persistence** - Track worker status and last successful operations
9. **Security** - Validate updates, secure communication
10. **Platform Integration** - Native service behavior per OS

---

## Architecture

### Process Model
```
System Service Manager (systemd/SC Manager)
        ↓
    tokenly-launcher (this component)
        ↓
    tokenly-worker (managed child process)
```

### Communication Flows
```
Launcher ←→ Server:    HTTP/HTTPS (heartbeat, config, updates)
Launcher ←→ Worker:    IPC (commands, status, control)
Launcher ←→ System:    Service APIs (registration, logging)
```

---

## Configuration

### Zero Configuration Approach

The launcher accepts a minimal set of arguments at startup:

| Argument | Required | Description |
|----------|----------|-------------|
| `--server <url>` | Yes | Server endpoint URL (e.g., `https://tokenly.example.com`) |
| `--hostname <name>` | No | Override auto-detected hostname |
| `--log-level <level>` | No | Override log level (default: `info`) |
| `--install` | No | Install as a system service and exit |

**All operational configuration comes from server heartbeat:**
- Scan intervals and behavior
- File size limits and age thresholds
- Update settings and binary distribution
- Worker configuration and timeouts
- Feature flags and overrides

### Runtime State File: `tokenly-state.json`

**Location:** Platform-specific data directory
- Linux: `/var/lib/tokenly/tokenly-state.json`
- Windows: `%PROGRAMDATA%\Tokenly\tokenly-state.json`
- macOS: `/Library/Application Support/Tokenly/tokenly-state.json`

```json
{
  "server_endpoint": "https://tokenly.example.com",
  "hostname": "web-server-01",
  "worker_status": "running|stopped|crashed",
  "worker_pid": 12345,
  "worker_version": "1.0.1",
  "last_heartbeat": "2026-02-09T09:45:00Z",
  "last_update_check": "2026-02-09T08:00:00Z",
  "server_approved": true,
  "consecutive_failures": 0,
  "server_config": {
    "scan_enabled": true,
    "scan_interval_minutes": 60,
    "max_file_age_hours": 24,
    "max_file_size_mb": 10,
    "heartbeat_interval_seconds": 3600
  }
}
```

---

## API Interfaces

### 1. Server Communication (HTTP Client)

#### Heartbeat Endpoint
**Request:**
```http
POST /api/heartbeat
Content-Type: application/json
Authorization: Bearer {api_key}  # Optional

{
  "client_hostname": "web-server-01",
  "timestamp": "2026-02-09T09:45:00Z",
  "launcher_version": "1.0.0",
  "worker_version": "1.0.1",
  "worker_status": "running|pending|stopped|crashed",
  "system_info": {
    "os": "linux",
    "arch": "x64",
    "platform": "Ubuntu 24.04"
  }
}
```

**Response (All Configuration from Server):**
```json
{
  "approved": true,
  "config": {
    "scan_enabled": true,
    "scan_interval_minutes": 60,
    "max_file_age_hours": 24,
    "max_file_size_mb": 10,
    "heartbeat_interval_seconds": 3600,
    "worker_timeout_seconds": 30,
    "max_concurrent_uploads": 3,
    "retry_failed_uploads": true,
    "retry_delay_seconds": 300,
    "log_level": "info"
  },
  "update": {
    "enabled": true,
    "available": true,
    "version": "1.0.2",
    "url": "/api/download/worker/1.0.2/linux-x64",
    "checksum": "sha256:abc123...",
    "required": false,
    "check_interval_hours": 24
  }
}
```

**Key Benefits:**
- **Centralized management** - All clients get consistent configuration
- **Dynamic updates** - Change settings without client restarts
- **Per-client overrides** - Server can provide custom config per hostname
- **Zero deployment complexity** - Just install with server URL

### 2. Worker Process Management (IPC)

#### Command Interface
**Method:** Named pipes (Windows) / Unix sockets (Linux/macOS)
**Location:**
- Linux: `/var/run/tokenly/worker.sock`
- Windows: `\\.\pipe\tokenly-worker`

#### IPC Message Format

**Launcher → Worker commands:**
```json
{"command": "start", "config": {"scan_enabled": true, "scan_interval_minutes": 60, "..."}}
{"command": "stop"}
{"command": "restart"}
{"command": "status"}
{"command": "shutdown"}
{"command": "update_config", "config": {"..."}}
```

**Worker → Launcher responses:**
```json
{"type": "started", "message": "Worker started successfully"}
{"type": "stopped", "message": "Worker stopped gracefully"}
{"type": "config_updated", "message": "Configuration applied"}
{"type": "status", "state": "scanning|processing|uploading|idle|error", "last_scan": "...", "files_found": 5}
{"type": "error", "message": "description", "fatal": true}
{"type": "heartbeat", "files_found": 5, "files_uploaded": 3, "scan_duration_ms": 1200}
```

---

## Platform-Specific Integration

> **Note:** The following platform configurations are provided as reference examples for service integration. Implementations should adapt these to their chosen language and deployment model.

### Linux (systemd)

**Service File:** `/etc/systemd/system/tokenly.service`
```ini
[Unit]
Description=Tokenly Token Usage Collector
After=network.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/tokenly-launcher
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
User=tokenly
Group=tokenly
WorkingDirectory=/var/lib/tokenly

[Install]
WantedBy=multi-user.target
```

### Windows (Service Control Manager)

**Service Registration:**
- Service Name: `Tokenly`
- Display Name: `Tokenly Token Usage Collector`
- Start Type: Automatic
- Service Account: Local System or dedicated service account

### macOS (launchd)

**Plist File:** `/Library/LaunchDaemons/com.tokenly.launcher.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tokenly.launcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/tokenly-launcher</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

---

## Update Mechanism

### Update Process Flow
```
1. Launcher checks for updates (heartbeat response or timer)
2. Download new worker binary to temp location
3. Verify checksum against server-provided hash
4. Stop current worker gracefully
5. Replace worker binary (atomic operation)
6. Start new worker with existing configuration
7. Verify new worker is healthy
8. Update state file with new version
9. Report success/failure to server
```

### Update Safety Features
- **Atomic replacement** - Use temp files and atomic moves
- **Checksum verification** - Validate downloaded binaries
- **Rollback capability** - Keep previous worker version as backup
- **Health verification** - Ensure new worker starts successfully
- **Failure recovery** - Revert to previous version if new worker fails

### Update File Layout
```
/var/lib/tokenly/
├── tokenly-worker              # Current worker binary
├── tokenly-worker.backup       # Previous version (rollback)
├── updates/
│   ├── tokenly-worker-1.0.2    # Downloaded update
│   └── checksums/
│       └── 1.0.2.sha256        # Verification hash
```

---

## Error Handling

### Worker Process Failures
- **Crash Detection** - Monitor worker process health
- **Automatic Restart** - Restart failed workers with exponential backoff
- **Failure Threshold** - Stop restart attempts after N consecutive failures
- **Alert Mechanism** - Report persistent failures to server

### Network Failures
- **Retry Logic** - Exponential backoff for server communication
- **Offline Operation** - Continue worker management without server contact
- **Graceful Degradation** - Function with limited capabilities during outages

### Update Failures
- **Download Verification** - Validate checksums before installation
- **Rollback on Failure** - Revert to previous worker version
- **Update Deferral** - Skip optional updates if installation fails
- **Manual Override** - Configuration option to disable updates

---

## Logging

### Log Levels
- **DEBUG** - Detailed operation traces, IPC communication
- **INFO** - Normal operations, worker starts/stops, updates
- **WARN** - Recoverable errors, retry attempts
- **ERROR** - Serious problems, update failures
- **FATAL** - Service-stopping errors

### Log Structure (JSON format)
```json
{
  "timestamp": "2026-02-09T09:45:00Z",
  "level": "INFO",
  "component": "launcher",
  "message": "Worker started successfully",
  "data": {
    "worker_pid": 12345,
    "worker_version": "1.0.1"
  }
}
```

### Log Rotation
- **Size-based** - Rotate when log file exceeds configured size
- **Retention** - Keep configurable number of archived log files
- **Compression** - Compress archived logs to save space

---

## Security Considerations

### Communication Security
- **HTTPS Only** - Enforce secure server communication
- **Certificate Validation** - Verify server certificates
- **API Keys** - Support optional authentication tokens
- **Rate Limiting** - Prevent abuse of server endpoints

### Update Security
- **Checksum Verification** - Validate all downloaded binaries
- **Signature Validation** - Future: cryptographic signatures
- **Download Source** - Only accept updates from configured server
- **File Permissions** - Secure binary file permissions

### Process Security
- **Privilege Separation** - Run with minimal required privileges
- **Secure IPC** - Protect inter-process communication channels
- **Configuration Security** - Secure config file permissions
- **Log Sanitization** - Avoid logging sensitive information

---

## Performance Requirements

### Resource Usage
- **Memory** - Maximum 50MB RAM usage
- **CPU** - < 1% CPU usage during normal operation
- **Network** - Minimal bandwidth (heartbeats only)
- **Startup Time** - Service ready within 10 seconds

### Scalability
- **Worker Management** - Handle single worker efficiently
- **Update Frequency** - Support updates without service disruption
- **Network Resilience** - Function during network interruptions
- **Long-term Stability** - Run continuously for months/years

---

## Testing Strategy

### Unit Tests
- Configuration parsing and validation
- Server communication (with mocked server)
- Worker process management
- Update mechanism (with test binaries)
- Error handling and recovery

### Integration Tests
- Full service lifecycle (install, start, stop, uninstall)
- Worker interaction (start, stop, restart, communication)
- Server integration (real server endpoints)
- Update process (download, verify, install)

### Platform Tests
- Service registration on all supported platforms
- Native OS integration (systemd, SCM, launchd)
- File permissions and security
- Platform-specific error conditions

### Long-running Tests
- Stability testing (24+ hour continuous operation)
- Memory leak detection
- Network interruption recovery
- Update reliability over time

---

## Dependencies

### Required Capabilities
- **HTTP Client** - For server communication (HTTPS with TLS 1.2+)
- **JSON Parser** - Configuration and API communication
- **Process Management** - Worker lifecycle control (spawn, signal, monitor)
- **Cryptography** - SHA-256 checksum verification
- **Platform Service APIs** - Service registration and management

### System Requirements
- **Linux** - systemd, glibc 2.17+
- **Windows** - Windows Service API
- **macOS** - launchd, macOS 10.12+
- **Network** - HTTPS connectivity to Tokenly server
- **Permissions** - Service installation and management rights

---

## Deployment

### Installation Package Contents
```
tokenly-launcher(.exe)           # Main launcher binary
tokenly-worker(.exe)             # Initial worker binary
install.sh/.bat                  # Installation script (optional)
README.txt                       # Installation instructions
```

### Installation Process
1. **Download and extract** - Single binary + initial worker
2. **Install as service** - `./tokenly-launcher --install --server <url>`
3. **Automatic service setup** - Creates system service with proper permissions
4. **Create dedicated user** - Linux/macOS only, for security isolation
5. **Start and verify** - Service starts automatically, begins heartbeat cycle

### Zero-Config Benefits
- **No configuration files** to manage or distribute
- **Server-side control** over all operational settings
- **Simplified deployment** - just binary + server URL
- **Consistent behavior** across all clients

### Uninstallation Process
1. Stop and disable service
2. Remove service registration
3. Remove binaries and configuration
4. Clean up logs and state files
5. Remove user account (if created)

---

This specification provides the foundation for implementing a robust, production-ready client launcher that can reliably manage worker processes and handle updates across all target platforms.
