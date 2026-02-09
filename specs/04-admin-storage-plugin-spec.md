# Component Specification: Admin Storage Plugin

## Overview

The Admin Storage Plugin handles small-scale, ACID-compliant data operations for Tokenly's administrative functions. It manages client registry, system configuration, user management, and audit trails - all the operational data needed to coordinate the system.

**Design Philosophy:**
- **ACID compliance** - Consistent client approval workflows
- **Relational data** - Structured queries and relationships
- **Low write volume** - Administrative operations, not high-throughput ingestion
- **Strong consistency** - Critical for approval states and configuration

---

## Responsibilities

### Primary Functions
1. **Client Management** - Registration, approval workflows, status tracking
2. **System Configuration** - Default settings, feature flags, overrides
3. **Administrative Users** - Admin accounts, API keys, permissions (future)
4. **Audit Trail** - Track who did what when for accountability
5. **Operational Metadata** - Client statistics, health metrics

### Secondary Functions
6. **Data Validation** - Enforce business rules and constraints
7. **Backup & Recovery** - Small dataset, frequent backups
8. **Migration Support** - Schema evolution as system grows
9. **Performance Optimization** - Indexing for common queries

---

## Plugin Interface

### Operation Table

| Operation | Input | Output | Behavior | Error Conditions |
|-----------|-------|--------|----------|-----------------|
| **Lifecycle** | | | | |
| `Initialize` | config (key-value map) | — | Set up storage backend, create schema if needed | Invalid config |
| `HealthCheck` | — | — | Verify storage is accessible and responsive | Storage unavailable |
| `Close` | — | — | Release resources, close connections | — |
| **Admin Users** | | | | |
| `CreateAdminUser` | user details (username, password, role) | AdminUser | Hash password, assign UUID, set defaults. Role determines initial permissions. | User already exists |
| `GetAdminUser` | username | AdminUser or null | Look up user by username | — |
| `GetAdminUserById` | user_id | AdminUser or null | Look up user by ID | — |
| `ListAdminUsers` | — | AdminUser[] | Return all admin users | — |
| `UpdateAdminUser` | username, updates (role, permissions, etc.) | — | Apply partial updates to user record | User not found |
| `SetAdminUserPassword` | username, password_hash, updated_by | — | Replace password hash | User not found |
| `DisableAdminUser` | username, disabled_by | — | Set `enabled=false`, record who disabled | User not found |
| `EnableAdminUser` | username, enabled_by | — | Set `enabled=true` | User not found |
| `DeleteAdminUser` | username, deleted_by | — | Remove user record | User not found |
| `ValidatePassword` | username, password | AdminUser or null | Verify password against stored hash; return user if valid, null if not | — |
| **Client Management** | | | | |
| `RegisterClient` | hostname, versions, system_info | ClientInfo | Create new client (status=pending) or return existing | — |
| `GetClient` | client_id | ClientInfo or null | Look up by ID | — |
| `GetClientByHostname` | hostname | ClientInfo or null | Look up by hostname | — |
| `UpdateClient` | client_id, updates | — | Apply partial updates (versions, stats, last_seen) | Client not found |
| `ListClients` | filter (status, hostname, date range, pagination) | ClientList | Return filtered, paginated client list | — |
| `DeleteClient` | client_id | — | Remove client record | Client not found |
| `SetClientStatus` | client_id, status, approved_by, notes | — | Change approval status, record who and why | Client not found, Invalid transition |
| `GetPendingClients` | — | ClientInfo[] | Return all clients with status=pending | — |
| **Configuration** | | | | |
| `GetConfig` | key | ConfigValue or null | Retrieve single config value | — |
| `SetConfig` | key, value, updated_by | — | Create or update config entry | Invalid value |
| `ListConfig` | prefix | ConfigValue[] | List config entries matching prefix | — |
| `DeleteConfig` | key, deleted_by | — | Remove config entry | — |
| `GetDefaultClientConfig` | — | ClientConfig | Return default config sent to all clients via heartbeat | — |
| `SetDefaultClientConfig` | config, updated_by | — | Update default client configuration | — |
| **Per-Client Config Overrides** | | | | |
| `GetClientConfig` | client_id | ClientConfig or null | Return merged config (defaults + overrides) for a client | — |
| `SetClientConfigOverride` | client_id, overrides, updated_by | — | Set per-client config overrides | Client not found |
| `RemoveClientConfigOverride` | client_id, updated_by | — | Remove all overrides for a client | — |
| `ListClientConfigOverrides` | — | ClientConfigOverride[] | List all clients with overrides | — |
| **Audit** | | | | |
| `LogAdminAction` | action details | — | Append to audit log | — |
| `GetAuditLog` | filter (user, action type, date range, pagination) | AdminAction[] | Query audit trail | — |
| **Stats** | | | | |
| `GetSystemStats` | — | SystemStats | Return aggregate system metrics | — |
| `GetClientStats` | client_id | ClientStats or null | Return stats for a specific client | — |

---

## Data Models

### Admin User

```json
{
  "user_id": "uuid-123",
  "username": "admin_user",
  "password_hash": "$2b$12$...",
  "role": "super_admin",
  "permissions": ["client:approve", "client:reject", "config:write", "user:create"],
  "enabled": true,
  "created_at": "2026-02-01T10:00:00Z",
  "updated_at": "2026-02-09T10:00:00Z",
  "last_login": "2026-02-09T09:45:00Z",
  "created_by": "system",
  "disabled_at": null,
  "disabled_by": "",
  "failed_attempts": 0,
  "locked_until": null,
  "must_change_password": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string (UUID) | Unique identifier |
| `username` | string | Login name (unique) |
| `password_hash` | string | bcrypt hash of password |
| `role` | string | One of: `super_admin`, `client_manager`, `viewer`, `custom` |
| `permissions` | string[] | List of permission strings |
| `enabled` | boolean | Whether the user can log in |
| `created_at` | datetime | Account creation time |
| `updated_at` | datetime | Last modification time |
| `last_login` | datetime? | Last successful login |
| `created_by` | string | Username of creator |
| `disabled_at` | datetime? | When disabled |
| `disabled_by` | string | Who disabled |
| `failed_attempts` | integer | Consecutive failed login attempts |
| `locked_until` | datetime? | Account lockout expiry |
| `must_change_password` | boolean | Force password change on next login |

### Roles and Permissions

**Roles:**

| Role | Value | Description |
|------|-------|-------------|
| Super Admin | `super_admin` | Full system access |
| Client Manager | `client_manager` | Client approval and configuration |
| Viewer | `viewer` | Read-only access |
| Custom | `custom` | Custom permission set |

**Permissions:**

| Permission | Description |
|------------|-------------|
| `client:approve` | Approve pending clients |
| `client:reject` | Reject clients |
| `client:delete` | Delete client records |
| `client:configure` | Set per-client config overrides |
| `config:read` | Read system configuration |
| `config:write` | Modify system configuration |
| `config:delete` | Delete configuration entries |
| `user:create` | Create admin users |
| `user:edit` | Edit admin user properties |
| `user:delete` | Delete admin users |
| `audit:read` | View audit trail |
| `system:manage` | System-level operations |

**Default role permissions:**

| Role | Permissions |
|------|-------------|
| `super_admin` | All permissions |
| `client_manager` | `client:approve`, `client:reject`, `client:configure`, `config:read`, `audit:read` |
| `viewer` | `config:read`, `audit:read` |

### Admin User Create (Input)

```json
{
  "username": "new_admin",
  "password": "secure_password_123!",
  "role": "client_manager",
  "custom_permissions": null,
  "created_by": "admin_user"
}
```

### Admin User Update (Input)

```json
{
  "role": "super_admin",
  "custom_permissions": null,
  "must_change_password": false,
  "last_login": "2026-02-09T10:15:00Z",
  "updated_by": "admin_user"
}
```

### Client Info

```json
{
  "client_id": "uuid-1",
  "hostname": "web-server-01",
  "status": "approved",
  "created_at": "2026-02-01T10:00:00Z",
  "updated_at": "2026-02-09T09:00:00Z",
  "last_seen": "2026-02-09T09:45:00Z",
  "approved_at": "2026-02-01T12:00:00Z",
  "approved_by": "admin_user",
  "approval_notes": "Production web server",
  "launcher_version": "1.0.0",
  "worker_version": "1.0.1",
  "worker_status": "running",
  "system_info": {
    "os": "linux",
    "arch": "x64",
    "platform": "Ubuntu 24.04",
    "version": "",
    "uptime_seconds": 86400
  },
  "stats": {
    "total_uploads": 156,
    "total_records": 125000,
    "last_upload": "2026-02-09T08:15:00Z",
    "files_uploaded_today": 12,
    "last_scan_time": "2026-02-09T09:00:00Z",
    "directories_monitored": 5,
    "errors_today": 0,
    "consecutive_failures": 0
  },
  "custom_config": {}
}
```

**Client Status values:** `pending`, `approved`, `rejected`, `suspended`

**Worker Status values:** `running`, `stopped`, `crashed`, `updating`

### Client Registration (Input)

```json
{
  "hostname": "web-server-01",
  "launcher_version": "1.0.0",
  "worker_version": "1.0.1",
  "system_info": { "os": "linux", "arch": "x64", "platform": "Ubuntu 24.04" },
  "registration_source": "heartbeat"
}
```

### Client Filter (Input)

```json
{
  "status": ["approved", "pending"],
  "hostname": "web-server",
  "last_seen_after": "2026-02-08T00:00:00Z",
  "last_seen_before": null,
  "created_after": null,
  "created_before": null,
  "limit": 100,
  "offset": 0,
  "order_by": "last_seen",
  "order_desc": true
}
```

### Client List (Output)

```json
{
  "clients": [ "..." ],
  "total": 42,
  "limit": 100,
  "offset": 0
}
```

### Configuration Value

```json
{
  "key": "server.auto_approve_clients",
  "value": false,
  "type": "bool",
  "created_at": "2026-02-01T00:00:00Z",
  "updated_at": "2026-02-09T10:00:00Z",
  "updated_by": "admin_user",
  "notes": ""
}
```

**Config type values:** `string`, `int`, `bool`, `json`, `secret` (encrypted)

### Client Config (Delivered via Heartbeat)

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
  "heartbeat_interval_seconds": 3600,
  "retry_failed_uploads": true,
  "retry_delay_seconds": 300,
  "log_level": "info",
  "update_enabled": true,
  "update_check_interval_hours": 24
}
```

### Client Config Override

```json
{
  "client_id": "uuid-1",
  "overrides": {
    "scan_interval_minutes": 30,
    "max_file_size_mb": 50,
    "log_level": "debug"
  },
  "created_at": "2026-02-09T10:00:00Z",
  "updated_at": "2026-02-09T10:00:00Z",
  "updated_by": "admin_user",
  "notes": "Increased scan frequency for troubleshooting"
}
```

### Default System Configuration

| Key | Default Value | Type | Description |
|-----|---------------|------|-------------|
| `server.auto_approve_clients` | `false` | bool | Auto-approve new clients |
| `server.max_clients` | `1000` | int | Maximum registered clients |
| `ingestion.rate_limit_per_hour` | `100` | int | Files per client per hour |
| `ingestion.max_file_size_mb` | `50` | int | Maximum upload file size |
| `audit.retention_days` | `90` | int | Audit log retention |

### Audit Trail

```json
{
  "id": "uuid-action-1",
  "timestamp": "2026-02-09T09:45:23Z",
  "user_id": "admin_user",
  "action": "client_approve",
  "resource": "client",
  "resource_id": "uuid-1",
  "details": {
    "hostname": "web-server-01",
    "notes": "Production server approved"
  },
  "ip_address": "192.168.1.100",
  "user_agent": "Mozilla/5.0 ..."
}
```

**Action type values:** `client_approve`, `client_reject`, `client_suspend`, `client_delete`, `config_set`, `config_delete`, `user_create`, `user_edit`, `user_disable`, `user_enable`, `user_delete`, `password_change`, `admin_login`, `admin_logout`, `admin_login_failed`

**Resource type values:** `user`, `client`, `config`, `system`

### Audit Filter (Input)

```json
{
  "user_id": "admin_user",
  "actions": ["client_approve", "client_reject"],
  "resources": ["client"],
  "resource_id": null,
  "timestamp_after": "2026-02-01T00:00:00Z",
  "timestamp_before": null,
  "limit": 100,
  "offset": 0
}
```

### System Stats (Output)

```json
{
  "version": "1.0.0",
  "uptime_seconds": 86400,
  "memory_usage_mb": 256,
  "cpu_usage_percent": 2.5,
  "storage": {
    "backend": "memory",
    "status": "healthy",
    "total_records": 125000,
    "total_size_mb": 0
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

## Storage Implementations

### 1. In-Memory Storage (Development/Testing)

**Use Case:** Development, testing, and initial deployment

**Behavioral description:**
- All data stored in thread-safe in-memory collections (maps/dictionaries)
- Operations protected by a mutex or read-write lock for concurrency safety
- `RegisterClient` checks for existing hostname and returns existing client if found; otherwise creates new with `status=pending`
- All returned objects are deep-copied to prevent external mutation of internal state
- Data is lost when the process restarts

### 2. PostgreSQL Storage (Production)

#### SQL Schema
```sql
-- Admin users table
CREATE TABLE admin_users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- bcrypt hash
    role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'client_manager', 'viewer', 'custom')),
    permissions TEXT[], -- Array of permission strings
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    disabled_at TIMESTAMP,
    disabled_by VARCHAR(255),

    -- Security fields
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    must_change_password BOOLEAN DEFAULT false
);

CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_enabled ON admin_users(enabled);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- Default super admin user (password should be changed on first login)
INSERT INTO admin_users (username, password_hash, role, permissions, created_by, must_change_password)
VALUES (
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/3YC8iMuKC', -- password: 'changeme'
    'super_admin',
    ARRAY['client:approve', 'client:reject', 'client:delete', 'client:configure',
          'config:read', 'config:write', 'config:delete',
          'user:create', 'user:edit', 'user:delete',
          'audit:read', 'system:manage'],
    'system',
    true
);

-- Clients table
CREATE TABLE clients (
    client_id UUID PRIMARY KEY,
    hostname VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    approval_notes TEXT,
    launcher_version VARCHAR(50),
    worker_version VARCHAR(50),
    worker_status VARCHAR(20) CHECK (worker_status IN ('running', 'stopped', 'crashed', 'updating')),
    system_info JSONB,
    total_uploads BIGINT DEFAULT 0,
    total_records BIGINT DEFAULT 0,
    last_upload TIMESTAMP,
    files_uploaded_today INTEGER DEFAULT 0,
    last_scan_time TIMESTAMP,
    directories_monitored INTEGER DEFAULT 0,
    errors_today INTEGER DEFAULT 0,
    consecutive_failures INTEGER DEFAULT 0,
    custom_config JSONB
);

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_hostname ON clients(hostname);
CREATE INDEX idx_clients_last_seen ON clients(last_seen);
CREATE INDEX idx_clients_created_at ON clients(created_at);

-- System configuration table
CREATE TABLE config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('string', 'int', 'bool', 'json', 'secret')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255) NOT NULL,
    notes TEXT
);

-- Client configuration table (sent to all clients via heartbeat)
CREATE TABLE client_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_data JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255) NOT NULL
);

-- Per-client configuration overrides
CREATE TABLE client_config_overrides (
    client_id UUID REFERENCES clients(client_id),
    overrides JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (client_id)
);

-- Default client configuration
INSERT INTO client_config (config_data, updated_by) VALUES
('{
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
    "heartbeat_interval_seconds": 3600,
    "retry_failed_uploads": true,
    "retry_delay_seconds": 300,
    "log_level": "info",
    "update_enabled": true,
    "update_check_interval_hours": 24
}', 'system');

-- System configuration defaults
INSERT INTO config (key, value, type, updated_by) VALUES
('server.auto_approve_clients', 'false', 'bool', 'system'),
('server.max_clients', '1000', 'int', 'system'),
('ingestion.rate_limit_per_hour', '100', 'int', 'system'),
('ingestion.max_file_size_mb', '50', 'int', 'system'),
('audit.retention_days', '90', 'int', 'system');

-- Audit log table
CREATE TABLE audit_log (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource, resource_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER config_updated_at
    BEFORE UPDATE ON config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER client_config_updated_at
    BEFORE UPDATE ON client_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER client_config_overrides_updated_at
    BEFORE UPDATE ON client_config_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### 3. SQLite Storage (Future)

**Use Case:** Development, single-user deployments, embedded systems

**Schema:** Same as PostgreSQL but with SQLite-specific adjustments:
- `UUID` → `TEXT`
- `JSONB` → `TEXT` (JSON stored as string)
- `INET` → `TEXT`
- Different trigger syntax

**Benefits:**
- Zero configuration
- Single file database
- No external dependencies
- Perfect for development and testing

---

### 4. Filesystem Storage (Future)

**Use Case:** Development, simple deployments, human-readable data

**Directory Structure:**
```
/data/admin/
├── clients/
│   ├── web-server-01.json
│   ├── laptop-dev.json
│   └── cloud-vm-prod.json
├── config/
│   ├── client.scan_enabled.json
│   ├── client.scan_interval_minutes.json
│   └── server.auto_approve_clients.json
├── audit/
│   ├── 2026-02-09.jsonl
│   ├── 2026-02-08.jsonl
│   └── index.json
└── stats/
    └── system.json
```

**Benefits:**
- Human readable and editable
- Easy backup (just copy directory)
- No database dependencies
- Simple debugging and inspection

---

## Configuration

### Plugin Configuration Examples

#### PostgreSQL Plugin
```json
{
  "type": "postgresql",
  "connection_string": "postgres://user:pass@localhost:5432/tokenly_admin",
  "pool_size": 10,
  "timeout_seconds": 30,
  "auto_migrate": true,
  "backup": {
    "enabled": true,
    "interval_hours": 6,
    "retention_days": 30,
    "s3_bucket": "tokenly-backups"
  }
}
```

#### SQLite Plugin
```json
{
  "type": "sqlite",
  "database_path": "/data/admin/tokenly.db",
  "wal_mode": true,
  "auto_migrate": true,
  "backup": {
    "enabled": true,
    "interval_hours": 12,
    "retention_count": 10,
    "backup_directory": "/data/admin/backups"
  }
}
```

#### Filesystem Plugin
```json
{
  "type": "filesystem",
  "base_directory": "/data/admin",
  "file_format": "json",
  "backup": {
    "enabled": true,
    "interval_hours": 24,
    "retention_days": 30,
    "compression": true
  }
}
```

---

## Error Handling

### Error Conditions

| Error | Condition | Recovery |
|-------|-----------|----------|
| Client already exists | `RegisterClient` with existing hostname | Return existing client (idempotent) |
| Client not found | Operation on non-existent client_id | Return error to caller |
| User not found | Operation on non-existent username | Return error to caller |
| User already exists | `CreateAdminUser` with duplicate username | Return error to caller |
| Storage not initialized | Any operation before `Initialize` | Return error to caller |
| Invalid status transition | e.g., `approved` → `pending` | Return error to caller |
| Invalid configuration value | `SetConfig` with wrong type | Return error to caller |
| Client not approved | Operation requiring approved status | Return error to caller |
| Client blocked/suspended | Operation on suspended client | Return error to caller |
| Cancellation | Any async operation cancelled by caller | Clean up and propagate cancellation |

All operations should accept a cancellation mechanism (e.g., cancellation token, context) to support graceful shutdown.

---

## Performance Requirements

### Operational Targets
- **Client lookup** - < 10ms average response time
- **Client approval** - < 50ms transaction time
- **Configuration read** - < 5ms response time
- **Audit log write** - < 25ms write time

### Scalability Limits
- **Maximum clients** - 10,000+ clients supported
- **Configuration entries** - 1,000+ config keys
- **Audit log** - 1M+ entries with retention policies
- **Concurrent operations** - 100+ simultaneous admin actions

### Optimization Strategies
- **Database indexes** - Optimize common query patterns
- **Connection pooling** - Efficient database resource usage
- **Read replicas** - Scale read operations (future)
- **Caching layer** - Cache frequently accessed config (future)

---

## Security Considerations

### Data Protection
- **Sensitive config** - Encrypt secret-type configuration values
- **Audit integrity** - Append-only audit logs with checksums
- **Access control** - Admin-only operations with proper authentication
- **Input validation** - Sanitize all incoming data

### Compliance Features
- **Audit trail** - Complete history of administrative actions
- **Data retention** - Configurable retention policies
- **Backup encryption** - Encrypted backups of sensitive data
- **Access logging** - Track who accessed what data when

---

## Testing Strategy

### Unit Tests
- CRUD operations for all entity types
- Configuration validation and type checking
- Error handling for all failure scenarios
- Data model serialization/deserialization

### Integration Tests
- Database schema migrations
- Plugin initialization and health checks
- Cross-entity operations (client approval workflow)
- Backup and recovery procedures

### Performance Tests
- Concurrent client operations
- Large-scale data queries
- Database performance under load
- Memory usage during bulk operations

### Security Tests
- Input validation and SQL injection prevention
- Authentication and authorization checks
- Sensitive data encryption/decryption
- Audit trail integrity verification

---

## Migration & Deployment

### Schema Migrations
- **Version-controlled** - Track schema changes over time
- **Backward compatible** - Support rolling updates
- **Rollback capability** - Revert schema changes if needed
- **Data preservation** - Maintain data integrity during upgrades

### Deployment Considerations
- **Plugin isolation** - Clean plugin interface boundaries
- **Configuration validation** - Validate plugin config at startup
- **Health monitoring** - Continuous health checks and alerting
- **Backup strategy** - Automated backups with disaster recovery

### Upgrade Path
1. **Backup existing data** - Full backup before any upgrade
2. **Run migrations** - Apply schema changes incrementally
3. **Validate data integrity** - Verify all data migrated correctly
4. **Update plugin configuration** - Adjust settings for new version
5. **Monitor performance** - Watch for any performance regressions

---

This specification provides a complete foundation for implementing robust, production-ready admin storage that handles all the operational data Tokenly needs to coordinate client management and system configuration.
