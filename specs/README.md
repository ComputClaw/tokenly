# Tokenly Architecture Specifications

This folder contains detailed specifications for each component of the Tokenly system.

> **Implementation note:** These specifications are **implementation-agnostic**. They define behavior, data contracts, and protocols — not implementation languages or frameworks. Any component may be built in any language or stack that satisfies the contracts described here.

## System Components

### 1. Client Launcher
**File:** [`01-client-launcher-spec.md`](01-client-launcher-spec.md)
**Purpose:** Stable service wrapper that manages worker lifecycle and updates

**Responsibilities:**
- System service registration (systemd/Windows Service)
- Heartbeat communication with server
- Worker process management (start/stop/restart)
- Binary updates (download/verify/replace worker)
- Configuration management
- Error recovery and logging

**Key Interfaces:**
- HTTP client for server communication
- Process management APIs
- File system operations for binary updates
- Platform-specific service APIs

---

### 2. Client Worker
**File:** [`02-client-worker-spec.md`](02-client-worker-spec.md)
**Purpose:** The detective engine that finds and uploads JSONL files

**Responsibilities:**
- Smart directory discovery and scanning
- JSONL file detection and age validation
- File upload with metadata
- Local cleanup (delete files, remove empty directories)
- Learning algorithm (remember successful locations)
- State tracking and persistence

**Key Interfaces:**
- HTTP client for file uploads
- File system scanning and monitoring
- JSONL parsing and validation
- State persistence (SQLite/JSON)

---

### 3. Server Core
**File:** [`03-server-core-spec.md`](03-server-core-spec.md)
**Purpose:** HTTP API for client coordination and data ingestion

**Responsibilities:**
- Client registration and approval workflow
- Heartbeat handling with status responses
- File ingestion API with validation
- Admin authentication (JWT)
- Client and user management
- Storage backend coordination via plugin interfaces

**Key Interfaces:**
- HTTP trigger endpoints (REST API)
- Storage plugin interfaces (Admin Storage, Token Storage)
- JWT-based admin authentication
- Shared domain model contracts

---

### 4. Admin Storage Plugin
**File:** [`04-admin-storage-plugin-spec.md`](04-admin-storage-plugin-spec.md)
**Purpose:** Storage backend for client registry, system configuration, and administrative data

**Responsibilities:**
- Client registration and approval management
- System configuration storage (default settings, feature flags)
- Admin user management and authentication
- Audit logging for administrative actions
- Client statistics and operational metadata
- Small-scale, ACID-compliant data operations

**Key Interfaces:**
- Admin Storage Plugin operations (see spec for full operation table)
- Client management (register, approve, list, delete)
- Configuration management
- Audit trail storage

---

### 5. Token Storage Plugin
**File:** [`05-token-storage-plugin-spec.md`](05-token-storage-plugin-spec.md)
**Purpose:** High-volume storage backend optimized for token usage data and analytics

**Responsibilities:**
- High-throughput JSONL record ingestion
- Time-series data storage and indexing
- Cost analytics and usage aggregations
- Data retention and cleanup policies
- Query interface for reporting and dashboards
- Optimized for write-heavy, append-only workloads

**Key Interfaces:**
- Token Storage Plugin operations (see spec for full operation table)
- Bulk record ingestion API
- Time-series query interface
- Analytics and aggregation functions

---

### 6. Admin Interface
**File:** [`06-admin-interface-spec.md`](06-admin-interface-spec.md)
**Purpose:** Web UI for system management and client approval

**Responsibilities:**
- Client approval workflow
- System status dashboard
- Configuration management
- Manual data inspection
- Usage analytics and reporting
- Client monitoring and troubleshooting

**Key Interfaces:**
- Single-page application (SPA) with responsive design
- REST API client for server backend
- JWT authentication with httpOnly cookies
- Data visualization (charts, tables)

---

### 7. Client Protocol
**File:** [`07-client-protocol-spec.md`](07-client-protocol-spec.md)
**Purpose:** Language-agnostic protocol contracts for client ↔ server interoperability

**Responsibilities:**
- Define wire formats (heartbeat, ingest HTTP contracts)
- Shared file schemas (state file, learning file)
- IPC contract between launcher and worker
- CLI argument, binary naming, and logging contracts
- Compliance test suite for validating any client implementation

**Key Interfaces:**
- HTTP protocol (heartbeat, ingest endpoints)
- IPC protocol (newline-delimited JSON over sockets/pipes)
- File format contracts (state, learning)
- Service integration contract (systemd, SCM, launchd)

**Implementation design docs:** Each client implementation has its own `DESIGN.md`:
- **Go** — [`client/go/DESIGN.md`](../client/go/DESIGN.md)

---

### 8. Ingestion Post-Processor
**File:** [`08-ingestion-post-processor-spec.md`](08-ingestion-post-processor-spec.md)
**Purpose:** Background processor that parses and validates raw JSONL files stored during ingestion

**Responsibilities:**
- Pick up raw files with `pending` status from Token Storage Plugin
- Parse JSONL content line by line
- Validate records (required fields, field formats)
- Enforce 50% validity threshold
- Store valid records via `storeUsageRecords`
- Track processing status (`processed` / `failed`) with detailed results
- Update client statistics after processing

**Key Interfaces:**
- Token Storage Plugin (raw file retrieval, record storage)
- Admin Storage Plugin (client statistics)
- Timer/scheduler trigger

---

### 9. Update Distribution *(Planned)*
**Purpose:** Binary versioning, building, and distribution system

**Responsibilities:**
- Multi-platform client binary builds (Linux/Windows/macOS)
- Version management and tagging
- Checksum generation and verification
- Binary hosting and distribution
- Release automation
- Rollback capability

**Key Interfaces:**
- CI/CD pipeline integration
- Binary artifact storage
- Version API for clients
- Download endpoint with authentication

---

## Development Phases

### Phase 1: Core Collection *(Current)*
**Target Components:** Server Core + Client Worker (basic) + Basic Storage
- HTTP API (heartbeat, ingestion, auth, admin)
- Basic worker (discovery + upload)
- Simple approval system
- In-memory storage plugins (development)

### Phase 2: Production Ready
**Target Components:** Client Launcher + Admin Interface + Database Storage
- Full launcher/worker architecture
- Web admin interface
- PostgreSQL admin storage plugin
- Database or time-series token storage plugin

### Phase 3: Advanced Features
**Target Components:** Update Distribution + Analytics + Cloud Storage
- Automated build/deployment for client binaries
- Advanced analytics dashboard
- Cloud storage plugins (Azure Blob, S3)
- Specialized analytics stores (InfluxDB, ClickHouse)

---

## Data Flow

```
Client Worker → Client Launcher → Server Core → Admin Storage Plugin
     ↓              ↓              ↓              ↓
File Discovery → Heartbeat → Client Registry → Client Management
     ↓              ↓              ↓              ↓
Upload Data → Status Check → Admin Interface → Configuration
     ↓              ↓              ↓              ↓
Cleanup → Version Check → Token Storage Plugin → Analytics
                          ↓              ↓
                    Usage Ingestion → Time-series Data
```

## Inter-Component Communication

### Client Launcher ↔ Worker
- **Protocol:** Local IPC (pipes, sockets, or shared files)
- **Purpose:** Start/stop commands, status monitoring
- **Data:** Worker health, scan results, error reports

### Client ↔ Server
- **Protocol:** HTTP/HTTPS REST API
- **Purpose:** Registration, heartbeat, data upload
- **Data:** Client status, JSONL files, configuration updates

### Server ↔ Admin Storage Plugin
- **Protocol:** In-process plugin interface via dependency injection
- **Purpose:** Client management, system configuration, audit trails
- **Data:** Client registry, approval status, system settings, admin actions

### Server ↔ Token Storage Plugin
- **Protocol:** In-process plugin interface via dependency injection
- **Purpose:** High-volume data ingestion, analytics queries
- **Data:** Token usage records, cost data, time-series analytics

### Admin Interface ↔ Server
- **Protocol:** HTTP REST API + WebSocket (for real-time updates)
- **Purpose:** Management, monitoring, configuration
- **Data:** Client status, system metrics, configuration changes

---

## Security Considerations

### Authentication & Authorization
- Client identification via hostname + optional API keys
- Server-side client approval workflow
- Admin interface authentication (JWT with httpOnly refresh cookies)
- Binary update signature verification

### Data Security
- HTTPS for all client-server communication
- Checksum verification for file uploads
- Secure storage of sensitive configuration
- Audit logging for admin actions

### Network Security
- Configurable server endpoints
- Client certificate validation (future)
- Rate limiting and DDoS protection
- Firewall-friendly communication patterns

---

Each component specification includes:
- Detailed API definitions
- Configuration parameters
- Error handling strategies
- Performance considerations
- Testing approaches
- Deployment requirements
