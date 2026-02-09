# Component Specification: Server Core

## Overview

The Server Core is the central coordination hub for the Tokenly system. It provides HTTP APIs for client communication, manages client registration and approval, handles token usage data ingestion, and coordinates with storage plugins for data persistence.

**Design Philosophy:**
- **API-first design** - Clean REST interfaces for all operations
- **Scalable architecture** - Handle hundreds of clients efficiently
- **Administrative control** - Built-in approval workflows and monitoring
- **Pluggable storage** - Storage backends are swappable via plugin interfaces

---

## Responsibilities

### Primary Functions
1. **Client Management** - Registration, approval, and status tracking
2. **Data Ingestion** - Receive and validate JSONL token usage files
3. **Configuration Distribution** - Push settings to approved clients
4. **Update Distribution** - Serve client binary updates
5. **Storage Coordination** - Interface with pluggable storage backends
6. **API Gateway** - Central HTTP interface for all client operations

### Secondary Functions
7. **Administrative Interface** - API endpoints for system management
8. **Health Monitoring** - System status and client health tracking
9. **Authentication** - Client identification and optional API key validation
10. **Logging & Metrics** - Comprehensive operation tracking

---

## Architecture

### Recommended Project Structure
```
project-root/
├── api/                          # HTTP endpoint handlers
│   ├── auth.*                    # Login, refresh, logout
│   ├── admin.*                   # Client/user management
│   └── client.*                  # Heartbeat, ingest
├── services/                     # Business logic
│   ├── admin_service.*
│   ├── client_service.*
│   ├── jwt_token_service.*
│   ├── jwt_validation_service.*
│   └── refresh_token_store.*
├── models/                       # Domain entities and DTOs
├── interfaces/                   # Plugin interface contracts
│   ├── admin_storage_plugin.*
│   └── token_storage_plugin.*
├── plugins/                      # Storage plugin implementations
│   ├── admin_storage/
│   └── token_storage/
└── config/                       # Configuration and startup
```

### Communication Flows
```
Clients ←→ Server:     HTTP/HTTPS REST API
Server ←→ Storage:     Plugin interface (dependency injection)
Admin UI ←→ Server:    HTTP/HTTPS REST API
Storage ←→ Backend:    In-memory / database / cloud storage
```

---

## API Specification

### Base URL Structure
```
Production:   https://<your-server-host>/api/
Development:  http://localhost:7071/api/
```

### Authentication
- **Client Identification** - Hostname-based (required)
- **API Keys** - Optional bearer token authentication
- **Admin Authentication** - Separate admin API keys

---

## Client API Endpoints

### 1. Client Registration & Heartbeat

#### POST /api/heartbeat
**Purpose:** Client registration, status updates, and configuration retrieval

**Request Headers:**
```http
Content-Type: application/json
Authorization: Bearer {client_api_key}  # Optional
User-Agent: tokenly-launcher/1.0.0
```

**Request Body:**
```json
{
  "client_hostname": "web-server-01",
  "timestamp": "2026-02-09T09:48:00Z",
  "launcher_version": "1.0.0",
  "worker_version": "1.0.1",
  "worker_status": "running|pending|stopped|crashed",
  "system_info": {
    "os": "linux|windows|darwin",
    "arch": "x64|arm64",
    "platform": "Ubuntu 24.04",
    "uptime_seconds": 86400
  },
  "stats": {
    "files_uploaded_today": 12,
    "last_scan_time": "2026-02-09T08:48:00Z",
    "directories_monitored": 5,
    "errors_since_last_heartbeat": 0
  }
}
```

**Response (200 OK - Complete Client Configuration):**
```json
{
  "client_id": "uuid-generated-by-server",
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
    "log_level": "info",
    "discovery_paths": {
      "linux": ["/var/log", "/opt/*/logs", "/home/*/logs"],
      "windows": ["%APPDATA%/logs", "%PROGRAMDATA%/logs"],
      "darwin": ["/var/log", "/usr/local/var/log"]
    },
    "file_patterns": ["*.jsonl", "*token*.log", "*usage*.log"],
    "exclude_patterns": ["*temp*", "*cache*", "*backup*"]
  },
  "update": {
    "enabled": true,
    "available": true,
    "version": "1.0.2",
    "download_url": "/api/download/worker/1.0.2/linux-x64",
    "checksum": "sha256:abc123def456...",
    "required": false,
    "check_interval_hours": 24,
    "release_notes": "Bug fixes and performance improvements"
  },
  "server_time": "2026-02-09T09:48:00Z"
}
```

**Note:** This response provides complete operational configuration - no local config files needed.

**Response (202 Accepted - Pending Approval):**
```json
{
  "approved": false,
  "message": "Client registration received. Awaiting administrator approval.",
  "retry_after_seconds": 3600
}
```

**Response (403 Forbidden - Rejected):**
```json
{
  "approved": false,
  "message": "Client access denied.",
  "reason": "hostname_blocked"
}
```

#### Heartbeat Processing Behavior

When a heartbeat request is received, the server:
1. Look up the client by hostname
2. If client does not exist: register as new (status = `pending`)
3. If client exists: update `last_seen`, version info, system info, and stats
4. If client status is `pending`: return 202 with retry interval
5. If client status is `rejected`: return 403
6. If client status is `approved`: return 200 with full config
7. Merge default client config with any per-client overrides
8. Check for available worker updates matching the client's platform
9. Log the heartbeat for monitoring

---

### 2. Token Usage Data Ingestion

#### POST /api/ingest
**Purpose:** Upload JSONL files containing token usage data

**Request Headers:**
```http
Content-Type: multipart/form-data
Authorization: Bearer {client_api_key}  # Optional
```

**Request Body (Multipart):**
```
--boundary
Content-Disposition: form-data; name="metadata"
Content-Type: application/json

{
  "client_hostname": "web-server-01",
  "collected_at": "2026-02-09T09:48:00Z",
  "file_info": {
    "original_path": "/var/log/openai/usage.jsonl",
    "directory": "/var/log/openai/",
    "filename": "usage.jsonl",
    "size_bytes": 847392,
    "modified_at": "2026-02-08T09:48:00Z",
    "line_count": 1205
  }
}

--boundary
Content-Disposition: form-data; name="file"; filename="usage.jsonl"
Content-Type: application/x-ndjson

{"timestamp": "2026-02-08T10:30:00Z", "service": "openai", "model": "gpt-4", "input_tokens": 1205, "output_tokens": 847, "cost_usd": 0.0234}
{"timestamp": "2026-02-08T10:31:00Z", "service": "anthropic", "model": "claude-sonnet-4", "input_tokens": 892, "output_tokens": 445, "cost_usd": 0.0156}
...
--boundary--
```

**Response (200 OK):**
```json
{
  "ingestion_id": "uuid-for-this-upload",
  "status": "accepted",
  "file_size_bytes": 847392,
  "line_count": 1205,
  "message": "File accepted for processing"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "validation_failed",
  "message": "Missing required metadata field: client_hostname"
}
```

**Response (413 Payload Too Large):**
```json
{
  "error": "file_too_large",
  "message": "File size exceeds maximum allowed limit",
  "max_size_mb": 50,
  "actual_size_mb": 55
}
```

#### Ingestion Processing Behavior

When an ingestion request is received:
1. Parse the multipart form data to extract metadata JSON and file bytes
2. Validate metadata fields (`client_hostname` required, `file_info` required with all sub-fields)
3. Verify the client is approved (look up by hostname)
4. Validate file size against configured limits
5. Store the raw file bytes and metadata via the Token Storage Plugin (`storeRawFile`)
6. Update client statistics (total uploads, last upload time)
7. Return acceptance result — **the file content is not parsed at ingest time**

Record parsing, validation, and storage happen asynchronously via the Ingestion Post-Processor. See [`08-ingestion-post-processor-spec.md`](08-ingestion-post-processor-spec.md).

---

### 3. Client Binary Updates

#### GET /api/download/worker/{version}/{platform}
**Purpose:** Download worker binary updates

**Parameters:**
- `version` - Semantic version (e.g., "1.0.2")
- `platform` - Target platform (e.g., "linux-x64", "windows-x64", "darwin-arm64")

**Response (200 OK):**
```http
Content-Type: application/octet-stream
Content-Length: 15728640
Content-Disposition: attachment; filename="tokenly-worker-1.0.2-linux-x64"
X-Checksum-SHA256: abc123def456...

[Binary data]
```

**Response (404 Not Found):**
```json
{
  "error": "version_not_found",
  "message": "Requested version or platform not available",
  "available_versions": ["1.0.0", "1.0.1"],
  "available_platforms": ["linux-x64", "windows-x64", "darwin-arm64"]
}
```

---

## Authentication API Endpoints

### Admin Authentication (JWT)

#### POST /api/auth/login
**Purpose:** Admin login with username/password

**Request:**
```json
{
  "username": "user",
  "password": "secure_password"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "username": "user",
    "permissions": ["client_manage", "config_write", "audit_read"]
  }
}
```

**Response includes httpOnly cookie:**
```http
Set-Cookie: refresh_token=<jwt_refresh_token>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

#### POST /api/auth/refresh
**Purpose:** Refresh expired access token using httpOnly refresh token

**Request:** (No body, refresh token sent as httpOnly cookie)

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

#### POST /api/auth/logout
**Purpose:** Invalidate refresh token and clear cookie

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Response clears httpOnly cookie:**
```http
Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0
```

#### Authentication Behavior

- **Login:** Validate credentials against admin storage, generate JWT access token (short-lived, ~15 min) and refresh token (long-lived, ~7 days). Return access token in body, refresh token in httpOnly cookie.
- **Refresh:** Read refresh token from cookie, validate it, generate new access token. This enables seamless session extension without re-login.
- **Logout:** Invalidate the refresh token in storage, clear the cookie.
- **JWT claims:** Include `username`, `role`, `permissions` array.
- **Protected endpoints:** All `/api/admin/*` endpoints require a valid JWT access token in the `Authorization: Bearer` header.

---

## Administrative API Endpoints

### 1. User Management

#### GET /api/admin/users
**Purpose:** List all users with their roles and status

**Request Headers:**
```http
Authorization: Bearer {admin_jwt_token}
```

**Response:**
```json
{
  "users": [
    {
      "user_id": "uuid-123",
      "username": "user",
      "role": "super_admin",
      "permissions": ["client:approve", "config:write", "user:create"],
      "enabled": true,
      "created_at": "2026-02-01T10:00:00Z",
      "last_login": "2026-02-09T10:15:00Z",
      "must_change_password": false
    }
  ],
  "total": 1
}
```

#### POST /api/admin/users
**Purpose:** Create a new user

**Request:**
```json
{
  "username": "new_admin",
  "password": "secure_password_123!",
  "role": "client_manager"
}
```

**Response:**
```json
{
  "user_id": "uuid-456",
  "username": "new_admin",
  "role": "client_manager",
  "enabled": true,
  "created_at": "2026-02-09T10:15:00Z",
  "must_change_password": true
}
```

#### PUT /api/admin/users/{username}/disable
**Purpose:** Disable a user

**Response:**
```json
{
  "username": "new_admin",
  "enabled": false,
  "disabled_at": "2026-02-09T10:15:00Z"
}
```

#### PUT /api/admin/users/{username}/password
**Purpose:** Change user password (admin or self)

**Request:**
```json
{
  "current_password": "old_password",
  "new_password": "new_secure_password_456!"
}
```

---

### 2. Client Management

#### GET /api/admin/clients
**Purpose:** List all registered clients with status

**Request Headers:**
```http
Authorization: Bearer {admin_api_key}
```

**Response:**
```json
{
  "clients": [
    {
      "client_id": "uuid-1",
      "hostname": "web-server-01",
      "status": "approved|pending|rejected",
      "last_seen": "2026-02-09T09:48:00Z",
      "launcher_version": "1.0.0",
      "worker_version": "1.0.1",
      "worker_status": "running",
      "system_info": {
        "os": "linux",
        "platform": "Ubuntu 24.04"
      },
      "stats": {
        "total_uploads": 156,
        "total_records": 125000,
        "last_upload": "2026-02-09T08:15:00Z"
      }
    }
  ],
  "total": 1,
  "summary": {
    "approved": 1,
    "pending": 0,
    "rejected": 0,
    "active": 1
  }
}
```

#### PUT /api/admin/clients/{client_id}/approve
**Purpose:** Approve a pending client

**Request:**
```json
{
  "approved": true,
  "notes": "Production web server - approved for token monitoring"
}
```

**Response:**
```json
{
  "client_id": "uuid-1",
  "status": "approved",
  "approved_at": "2026-02-09T09:48:00Z",
  "approved_by": "user"
}
```

#### DELETE /api/admin/clients/{client_id}
**Purpose:** Remove a client (reject and block future registrations)

**Response:**
```json
{
  "client_id": "uuid-1",
  "status": "deleted",
  "deleted_at": "2026-02-09T09:48:00Z"
}
```

---

### 3. System Status

#### GET /api/admin/status
**Purpose:** Server health and operational metrics

**Response:**
```json
{
  "server": {
    "version": "1.0.0",
    "uptime_seconds": 86400,
    "memory_usage_mb": 256,
    "cpu_usage_percent": 2.5
  },
  "storage": {
    "backend": "postgresql",
    "status": "healthy",
    "total_records": 1250000,
    "total_size_mb": 2048
  },
  "clients": {
    "total": 5,
    "active": 4,
    "pending": 1
  },
  "ingestion": {
    "files_today": 48,
    "records_today": 125000,
    "average_processing_time_ms": 125,
    "errors_today": 2
  }
}
```

---

## Database Schema (Reference for Relational Storage)

*Note: This schema represents one implementation of the Storage Plugin interface. Other storage backends (filesystem, cloud storage) will implement the same interface differently.*

### Client Registry Table
```sql
CREATE TABLE clients (
    client_id UUID PRIMARY KEY,
    hostname VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'pending', 'approved', 'rejected'
    created_at TIMESTAMP NOT NULL,
    last_seen TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),

    -- Client information
    launcher_version VARCHAR(50),
    worker_version VARCHAR(50),
    worker_status VARCHAR(20),

    -- System information (JSON)
    system_info JSONB,

    -- Statistics
    total_uploads INTEGER DEFAULT 0,
    total_records BIGINT DEFAULT 0,
    last_upload TIMESTAMP,

    -- Configuration override (optional)
    custom_config JSONB
);

CREATE INDEX idx_clients_hostname ON clients(hostname);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_last_seen ON clients(last_seen);
```

### Token Usage Records Table
```sql
CREATE TABLE token_usage (
    id BIGSERIAL PRIMARY KEY,
    client_id UUID REFERENCES clients(client_id),
    ingested_at TIMESTAMP NOT NULL,

    -- File metadata
    file_path VARCHAR(1000),
    file_directory VARCHAR(500),
    file_size_bytes BIGINT,
    file_modified_at TIMESTAMP,

    -- Token usage data (from JSONL)
    timestamp TIMESTAMP NOT NULL,
    service VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd DECIMAL(10,4),

    -- Additional fields (flexible)
    metadata JSONB
);

CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX idx_token_usage_service ON token_usage(service);
CREATE INDEX idx_token_usage_client_id ON token_usage(client_id);
CREATE INDEX idx_token_usage_ingested_at ON token_usage(ingested_at);
```

### System Configuration Table
```sql
CREATE TABLE server_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updated_by VARCHAR(255)
);

-- Default configuration
INSERT INTO server_config (key, value, updated_at, updated_by) VALUES
('default_client_config', '{
    "scan_enabled": true,
    "scan_interval_minutes": 60,
    "max_file_age_hours": 24,
    "max_file_size_mb": 10,
    "heartbeat_interval_seconds": 3600
}', NOW(), 'system'),
('ingestion_limits', '{
    "max_file_size_mb": 50,
    "max_records_per_file": 100000,
    "rate_limit_files_per_hour": 100
}', NOW(), 'system');
```

---

## Environment Configuration

The server requires a small set of configuration values, typically provided via environment variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOKENLY_JWT_SECRET` | Yes | — | 256-bit secret key for JWT signing |
| `TOKENLY_JWT_EXPIRATION_MINUTES` | No | `15` | Access token lifetime |
| `TOKENLY_REFRESH_TOKEN_EXPIRATION_DAYS` | No | `7` | Refresh token lifetime |
| `TOKENLY_JWT_ISSUER` | No | `tokenly-server` | JWT issuer claim |
| `TOKENLY_JWT_AUDIENCE` | No | `tokenly-admin` | JWT audience claim |
| `TOKENLY_STORAGE_ADMIN_TYPE` | No | `memory` | Admin storage plugin type |
| `TOKENLY_STORAGE_TOKEN_TYPE` | No | `memory` | Token storage plugin type |
| `TOKENLY_CORS_ORIGINS` | No | `*` | Allowed CORS origins |

Additional plugin-specific environment variables may be required depending on the storage backend chosen (e.g., database connection strings).

---

## Storage Plugin Interfaces

Storage is split into two plugin interfaces, wired via dependency injection at startup.

### Admin Storage Plugin

Handles client registry, users, system configuration, and audit logs. See [04-admin-storage-plugin-spec.md](04-admin-storage-plugin-spec.md) for the full operation table and data models.

### Token Storage Plugin

Handles high-volume token usage data, analytics queries, and retention policies. See [05-token-storage-plugin-spec.md](05-token-storage-plugin-spec.md) for the full operation table and data models.

### Built-in Storage Plugins

| Plugin | Use Case | Notes |
|--------|----------|-------|
| **In-Memory** | Development, testing | Data lost on restart; ships as default |
| **PostgreSQL/MySQL** | Production | Full ACID, complex queries, relational storage |
| **Filesystem** | Simple deployments | Human-readable JSON/JSONL files, easy backup |
| **SQLite** | Single-user, embedded | Zero-config, file-based, same SQL schema as PostgreSQL |
| **Cloud Storage** (future) | Cloud-native | Serverless, auto-scaling, managed backups |

---

## Error Handling

### HTTP Status Codes
- **200 OK** - Successful operation
- **202 Accepted** - Request accepted, pending approval
- **400 Bad Request** - Invalid request format or parameters
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Access denied (rejected client)
- **413 Payload Too Large** - File size exceeds limits
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Server-side error
- **503 Service Unavailable** - Storage backend unavailable

### Error Response Format
```json
{
  "error": "error_code",
  "message": "Human-readable error description",
  "details": {
    "field": "Additional context",
    "suggestion": "Possible resolution"
  },
  "timestamp": "2026-02-09T09:48:00Z",
  "request_id": "uuid-for-debugging"
}
```

### Retry Logic for Clients
- **5xx errors** - Exponential backoff retry
- **429 rate limiting** - Respect Retry-After header
- **403 forbidden** - Stop retrying, require admin intervention
- **400 bad request** - Log error, don't retry same payload

---

## Security

### Authentication & Authorization
- **Admin API Keys** - Full system access
- **Client API Keys** - Optional per-client authentication
- **Hostname Validation** - Prevent client impersonation
- **Rate Limiting** - Prevent abuse and DoS attacks

### Data Security
- **Input Validation** - Sanitize all incoming data
- **SQL Injection Prevention** - Parameterized queries
- **File Upload Security** - Validate file types and sizes
- **Audit Logging** - Track all administrative actions

### Network Security
- **HTTPS Only** - Enforce encrypted communication
- **CORS Configuration** - Restrict browser access
- **Request Size Limits** - Prevent memory exhaustion
- **Timeout Configuration** - Prevent resource starvation

---

## Performance & Scalability

### Performance Targets
- **Heartbeat Response** - < 100ms average
- **File Ingestion** - < 5 seconds for 1MB files
- **Memory Usage** - < 512MB steady state
- **Concurrent Clients** - Support 1000+ active clients

### Scalability Features
- **Horizontal scaling** - Stateless design allows multiple instances
- **Async Processing** - Non-blocking I/O operations
- **Stateless design** - No in-process session state (except in-memory development storage)
- **Pluggable storage** - Swap in persistent backends independently

### Monitoring & Metrics
- **Admin status endpoint** - `/api/admin/status` for operational metrics
- **Structured logging** - JSON log output throughout
- **Performance Tracking** - Request duration tracked per endpoint
- **Health checks** - Storage plugins expose health check operations

---

## Testing Strategy

### Unit Tests
- API endpoint handlers
- Business logic validation
- Storage plugin interfaces
- Configuration parsing
- Error handling paths

### Integration Tests
- Database operations
- Storage plugin implementations
- Authentication flows
- File upload/processing
- Client approval workflows

### API Tests
- Complete request/response cycles
- Error condition handling
- Rate limiting behavior
- Authentication validation
- Data validation

### Performance Tests
- Load testing with multiple clients
- Database performance under load
- File upload stress testing
- Memory leak detection
- Resource usage monitoring

---

## Deployment

### Deployment Options

The server can be deployed as:
1. **Serverless functions** (e.g., Azure Functions, AWS Lambda) — auto-scaling, pay-per-use
2. **Container** (e.g., Docker + Kubernetes) — portable, self-hosted
3. **Traditional server process** — simple deployments, full control

### Build and Run

Regardless of framework, the server needs:
1. HTTP listener on configured port (default: 7071)
2. Storage plugin initialization at startup
3. JWT secret configuration
4. CORS headers for admin interface access

### Health Monitoring

Storage plugins expose health checks called during startup. The `/api/admin/status` endpoint provides operational health data including client counts, ingestion stats, and storage status.

### Production Deployment Checklist
- [ ] Server instance created and configured
- [ ] Environment variables configured (JWT secret, storage settings)
- [ ] JWT secret generated and stored securely
- [ ] Storage plugins configured (persistent backends for production)
- [ ] HTTPS enforced
- [ ] Monitoring/logging enabled
- [ ] CI/CD pipeline configured
- [ ] Backup strategy implemented for persistent storage
- [ ] Default user created

---

This specification provides a complete foundation for the Server Core component, with production-ready APIs, security measures, and flexible deployment configurations.
