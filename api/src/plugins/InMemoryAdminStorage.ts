import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { IAdminStoragePlugin } from '../interfaces/IAdminStoragePlugin.js';
import {
  User, UserCreate, UserUpdate,
  Permission, DEFAULT_ROLE_PERMISSIONS,
  ClientInfo, ClientRegistration, ClientFilter, ClientList,
  ClientConfig, ClientConfigOverride, ClientStatus,
  ConfigValue, ConfigType,
  AuditAction, AuditFilter,
  SystemStats, ClientStatsDetail,
  NotFoundError, ConflictError,
  toUserId, toClientId, toAuditId,
} from '../models/index.js';
import type { UserId, ClientId } from '../models/index.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

const DEFAULT_CLIENT_CONFIG = {
  scan_enabled: true,
  scan_interval_minutes: 60,
  max_file_age_hours: 24,
  max_file_size_mb: 10,
  worker_timeout_seconds: 30,
  max_concurrent_uploads: 3,
  discovery_paths: {
    linux: ['/var/log', '/opt/*/logs', '/home/*/logs'],
    windows: ['%APPDATA%/logs', '%PROGRAMDATA%/logs'],
    darwin: ['/var/log', '/usr/local/var/log'],
  },
  file_patterns: ['*.jsonl', '*token*.log', '*usage*.log'],
  exclude_patterns: ['*temp*', '*cache*', '*backup*'],
  heartbeat_interval_seconds: 3600,
  retry_failed_uploads: true,
  retry_delay_seconds: 300,
  log_level: 'info',
  update_enabled: true,
  update_check_interval_hours: 24,
} as const satisfies ClientConfig;

interface DefaultSystemConfigEntry {
  readonly key: string;
  readonly value: unknown;
  readonly type: ConfigType;
}

const DEFAULT_SYSTEM_CONFIG = [
  { key: 'server.auto_approve_clients', value: false, type: 'bool' },
  { key: 'server.max_clients', value: 1000, type: 'int' },
  { key: 'ingestion.rate_limit_per_hour', value: 100, type: 'int' },
  { key: 'ingestion.max_file_size_mb', value: 50, type: 'int' },
  { key: 'audit.retention_days', value: 90, type: 'int' },
] as const satisfies readonly DefaultSystemConfigEntry[];

function getPermissionsForRole(role: string): Permission[] {
  if (role in DEFAULT_ROLE_PERMISSIONS) {
    const perms = DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS];
    return [...perms];
  }
  return [];
}

export class InMemoryAdminStorage implements IAdminStoragePlugin {
  private users = new Map<string, User>();
  private usersById = new Map<UserId, User>();
  private clients = new Map<ClientId, ClientInfo>();
  private clientsByHostname = new Map<string, ClientInfo>();
  private configStore = new Map<string, ConfigValue>();
  private defaultClientConfig: ClientConfig = deepClone<ClientConfig>({ ...DEFAULT_CLIENT_CONFIG });
  private clientConfigOverrides = new Map<ClientId, ClientConfigOverride>();
  private auditLog: AuditAction[] = [];
  private startTime = Date.now();

  async initialize(_config: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString();
    for (const entry of DEFAULT_SYSTEM_CONFIG) {
      this.configStore.set(entry.key, {
        key: entry.key,
        value: entry.value,
        type: entry.type,
        created_at: now,
        updated_at: now,
        updated_by: 'system',
        notes: '',
      });
    }

    this.defaultClientConfig = deepClone<ClientConfig>({ ...DEFAULT_CLIENT_CONFIG });

    await this.createUser({
      username: 'admin',
      password: 'changeme',
      role: 'super_admin',
      created_by: 'system',
    });

    const seededUser = this.users.get('admin');
    if (seededUser) {
      seededUser.must_change_password = true;
    }
  }

  async healthCheck(): Promise<void> {
    // In-memory storage is always healthy
  }

  async close(): Promise<void> {
    this.users.clear();
    this.usersById.clear();
    this.clients.clear();
    this.clientsByHostname.clear();
    this.configStore.clear();
    this.clientConfigOverrides.clear();
    this.auditLog = [];
  }

  // --- Users ---

  async createUser(input: UserCreate): Promise<User> {
    if (this.users.has(input.username)) {
      throw new ConflictError(`User already exists: ${input.username}`);
    }

    const now = new Date().toISOString();
    const permissions: Permission[] = input.custom_permissions
      ? [...input.custom_permissions]
      : getPermissionsForRole(input.role);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = toUserId(uuidv4());

    const user: User = {
      user_id: userId,
      username: input.username,
      password_hash: passwordHash,
      role: input.role,
      permissions,
      enabled: true,
      created_at: now,
      updated_at: now,
      last_login: null,
      created_by: input.created_by,
      disabled_at: null,
      disabled_by: '',
      failed_attempts: 0,
      locked_until: null,
      must_change_password: false,
    };

    this.users.set(user.username, user);
    this.usersById.set(user.user_id, user);
    return deepClone(user);
  }

  async getUser(username: string): Promise<User | null> {
    const user = this.users.get(username);
    return user ? deepClone(user) : null;
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.usersById.get(toUserId(userId));
    return user ? deepClone(user) : null;
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values()).map(u => deepClone(u));
  }

  async updateUser(username: string, updates: UserUpdate): Promise<void> {
    const user = this.users.get(username);
    if (!user) {
      throw new NotFoundError('User', username);
    }

    if (updates.role !== undefined) {
      user.role = updates.role;
      user.permissions = updates.custom_permissions
        ? [...updates.custom_permissions]
        : getPermissionsForRole(updates.role);
    } else if (updates.custom_permissions) {
      user.permissions = [...updates.custom_permissions];
    }

    if (updates.must_change_password !== undefined) {
      user.must_change_password = updates.must_change_password;
    }
    if (updates.last_login !== undefined) {
      user.last_login = updates.last_login;
    }
    user.updated_at = new Date().toISOString();
  }

  async setUserPassword(username: string, passwordHash: string, _updatedBy: string): Promise<void> {
    const user = this.users.get(username);
    if (!user) {
      throw new NotFoundError('User', username);
    }
    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
  }

  async disableUser(username: string, disabledBy: string): Promise<void> {
    const user = this.users.get(username);
    if (!user) {
      throw new NotFoundError('User', username);
    }
    const now = new Date().toISOString();
    user.enabled = false;
    user.disabled_at = now;
    user.disabled_by = disabledBy;
    user.updated_at = now;
  }

  async enableUser(username: string, _enabledBy: string): Promise<void> {
    const user = this.users.get(username);
    if (!user) {
      throw new NotFoundError('User', username);
    }
    user.enabled = true;
    user.disabled_at = null;
    user.disabled_by = '';
    user.updated_at = new Date().toISOString();
  }

  async deleteUser(username: string, _deletedBy: string): Promise<void> {
    const user = this.users.get(username);
    if (!user) {
      throw new NotFoundError('User', username);
    }
    this.users.delete(username);
    this.usersById.delete(user.user_id);
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    const user = this.users.get(username);
    if (!user || !user.enabled) {
      return null;
    }

    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (Date.now() < lockExpiry) {
        return null;
      }
      user.locked_until = null;
      user.failed_attempts = 0;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      user.failed_attempts += 1;
      if (user.failed_attempts >= 5) {
        user.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      return null;
    }

    user.failed_attempts = 0;
    user.locked_until = null;
    return deepClone(user);
  }

  // --- Client Management ---

  async registerClient(registration: ClientRegistration): Promise<ClientInfo> {
    const existing = this.clientsByHostname.get(registration.hostname);
    if (existing) {
      return deepClone(existing);
    }

    const now = new Date().toISOString();
    const clientId = toClientId(uuidv4());

    const client: ClientInfo = {
      client_id: clientId,
      hostname: registration.hostname,
      status: 'pending',
      created_at: now,
      updated_at: now,
      last_seen: now,
      approved_at: null,
      approved_by: null,
      approval_notes: null,
      launcher_version: registration.launcher_version ?? null,
      worker_version: registration.worker_version ?? null,
      worker_status: null,
      system_info: registration.system_info ?? null,
      stats: {
        total_uploads: 0,
        total_records: 0,
        last_upload: null,
        files_uploaded_today: 0,
        last_scan_time: null,
        directories_monitored: 0,
        errors_today: 0,
        consecutive_failures: 0,
      },
      custom_config: {},
    };

    this.clients.set(client.client_id, client);
    this.clientsByHostname.set(client.hostname, client);
    return deepClone(client);
  }

  async getClient(clientId: string): Promise<ClientInfo | null> {
    const client = this.clients.get(toClientId(clientId));
    return client ? deepClone(client) : null;
  }

  async getClientByHostname(hostname: string): Promise<ClientInfo | null> {
    const client = this.clientsByHostname.get(hostname);
    return client ? deepClone(client) : null;
  }

  async updateClient(clientId: string, updates: Partial<ClientInfo>): Promise<void> {
    const client = this.clients.get(toClientId(clientId));
    if (!client) {
      throw new NotFoundError('Client', clientId);
    }

    if (updates.last_seen !== undefined) client.last_seen = updates.last_seen;
    if (updates.launcher_version !== undefined) client.launcher_version = updates.launcher_version;
    if (updates.worker_version !== undefined) client.worker_version = updates.worker_version;
    if (updates.worker_status !== undefined) client.worker_status = updates.worker_status;
    if (updates.system_info !== undefined) client.system_info = updates.system_info;
    if (updates.stats !== undefined) {
      Object.assign(client.stats, updates.stats);
    }
    client.updated_at = new Date().toISOString();
  }

  async listClients(filter: ClientFilter): Promise<ClientList> {
    let results = Array.from(this.clients.values());

    if (filter.status && filter.status.length > 0) {
      const statuses = filter.status;
      results = results.filter(c => statuses.includes(c.status));
    }

    if (filter.hostname) {
      const search = filter.hostname.toLowerCase();
      results = results.filter(c => c.hostname.toLowerCase().includes(search));
    }

    if (filter.last_seen_after) {
      const after = new Date(filter.last_seen_after).getTime();
      results = results.filter(c => c.last_seen !== null && new Date(c.last_seen).getTime() >= after);
    }
    if (filter.last_seen_before) {
      const before = new Date(filter.last_seen_before).getTime();
      results = results.filter(c => c.last_seen !== null && new Date(c.last_seen).getTime() <= before);
    }

    if (filter.created_after) {
      const after = new Date(filter.created_after).getTime();
      results = results.filter(c => new Date(c.created_at).getTime() >= after);
    }
    if (filter.created_before) {
      const before = new Date(filter.created_before).getTime();
      results = results.filter(c => new Date(c.created_at).getTime() <= before);
    }

    const total = results.length;

    const orderBy = filter.order_by ?? 'created_at';
    const desc = filter.order_desc ?? true;
    results.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[orderBy];
      const bVal = (b as unknown as Record<string, unknown>)[orderBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return desc ? 1 : -1;
      if (bVal == null) return desc ? -1 : 1;
      const cmp = String(aVal).localeCompare(String(bVal));
      return desc ? -cmp : cmp;
    });

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return {
      clients: results.map(c => deepClone(c)),
      total,
      limit,
      offset,
    };
  }

  async deleteClient(clientId: string): Promise<void> {
    const typedId = toClientId(clientId);
    const client = this.clients.get(typedId);
    if (!client) {
      throw new NotFoundError('Client', clientId);
    }
    this.clients.delete(typedId);
    this.clientsByHostname.delete(client.hostname);
    this.clientConfigOverrides.delete(typedId);
  }

  async setClientStatus(clientId: string, status: ClientStatus, approvedBy: string, notes?: string): Promise<void> {
    const client = this.clients.get(toClientId(clientId));
    if (!client) {
      throw new NotFoundError('Client', clientId);
    }

    const now = new Date().toISOString();
    client.status = status;
    client.updated_at = now;

    if (status === 'approved') {
      client.approved_at = now;
      client.approved_by = approvedBy;
    }
    if (notes) {
      client.approval_notes = notes;
    }
  }

  async getPendingClients(): Promise<ClientInfo[]> {
    return Array.from(this.clients.values())
      .filter(c => c.status === 'pending')
      .map(c => deepClone(c));
  }

  // --- Configuration ---

  async getConfig(key: string): Promise<ConfigValue | null> {
    const val = this.configStore.get(key);
    return val ? deepClone(val) : null;
  }

  async setConfig(key: string, value: unknown, updatedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.configStore.get(key);
    const configType: ConfigType = typeof value === 'boolean' ? 'bool'
      : typeof value === 'number' ? 'int'
      : typeof value === 'object' ? 'json'
      : 'string';

    this.configStore.set(key, {
      key,
      value,
      type: existing?.type ?? configType,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by: updatedBy,
      notes: existing?.notes ?? '',
    });
  }

  async listConfig(prefix: string): Promise<ConfigValue[]> {
    return Array.from(this.configStore.values())
      .filter(c => c.key.startsWith(prefix))
      .map(c => deepClone(c));
  }

  async deleteConfig(key: string, _deletedBy: string): Promise<void> {
    this.configStore.delete(key);
  }

  async getDefaultClientConfig(): Promise<ClientConfig> {
    return deepClone(this.defaultClientConfig);
  }

  async setDefaultClientConfig(config: ClientConfig, _updatedBy: string): Promise<void> {
    this.defaultClientConfig = deepClone(config);
  }

  // --- Per-Client Config Overrides ---

  async getClientConfig(clientId: string): Promise<ClientConfig | null> {
    const typedId = toClientId(clientId);
    if (!this.clients.has(typedId)) return null;

    const defaults = deepClone(this.defaultClientConfig);
    const override = this.clientConfigOverrides.get(typedId);
    if (override) {
      return { ...defaults, ...override.overrides } as ClientConfig;
    }
    return defaults;
  }

  async setClientConfigOverride(clientId: string, overrides: Record<string, unknown>, updatedBy: string): Promise<void> {
    const typedId = toClientId(clientId);
    if (!this.clients.has(typedId)) {
      throw new NotFoundError('Client', clientId);
    }

    const now = new Date().toISOString();
    const existing = this.clientConfigOverrides.get(typedId);

    this.clientConfigOverrides.set(typedId, {
      client_id: typedId,
      overrides: deepClone(overrides),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by: updatedBy,
    });
  }

  async removeClientConfigOverride(clientId: string, _updatedBy: string): Promise<void> {
    this.clientConfigOverrides.delete(toClientId(clientId));
  }

  async listClientConfigOverrides(): Promise<ClientConfigOverride[]> {
    return Array.from(this.clientConfigOverrides.values()).map(o => deepClone(o));
  }

  // --- Audit ---

  async logAdminAction(action: Omit<AuditAction, 'id' | 'timestamp'>): Promise<void> {
    this.auditLog.push({
      id: toAuditId(uuidv4()),
      timestamp: new Date().toISOString(),
      ...deepClone(action),
    });
  }

  async getAuditLog(filter: AuditFilter): Promise<{ entries: AuditAction[]; total: number }> {
    let results = [...this.auditLog];

    if (filter.user_id) {
      const userId = filter.user_id;
      results = results.filter(a => a.user_id === userId);
    }
    if (filter.actions && filter.actions.length > 0) {
      const actions = filter.actions;
      results = results.filter(a => actions.includes(a.action));
    }
    if (filter.resources && filter.resources.length > 0) {
      const resources = filter.resources;
      results = results.filter(a => resources.includes(a.resource));
    }
    if (filter.resource_id) {
      const resourceId = filter.resource_id;
      results = results.filter(a => a.resource_id === resourceId);
    }
    if (filter.timestamp_after) {
      const after = new Date(filter.timestamp_after).getTime();
      results = results.filter(a => new Date(a.timestamp).getTime() >= after);
    }
    if (filter.timestamp_before) {
      const before = new Date(filter.timestamp_before).getTime();
      results = results.filter(a => new Date(a.timestamp).getTime() <= before);
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = results.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    const entries = results.slice(offset, offset + limit).map(a => deepClone(a));
    return { entries, total };
  }

  // --- Stats ---

  async getSystemStats(): Promise<SystemStats> {
    const allClients = Array.from(this.clients.values());
    const approvedClients = allClients.filter(c => c.status === 'approved');
    const pendingClients = allClients.filter(c => c.status === 'pending');

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activeClients = approvedClients.filter(
      c => c.last_seen !== null && new Date(c.last_seen).getTime() > oneDayAgo
    );

    const memUsage = process.memoryUsage();

    return {
      version: '1.0.0',
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      memory_usage_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      cpu_usage_percent: 0,
      storage: {
        backend: 'memory',
        status: 'healthy',
        total_records: allClients.reduce((sum, c) => sum + c.stats.total_records, 0),
        total_size_mb: 0,
      },
      clients: {
        total: allClients.length,
        active: activeClients.length,
        pending: pendingClients.length,
      },
      ingestion: {
        files_today: allClients.reduce((sum, c) => sum + c.stats.files_uploaded_today, 0),
        records_today: 0,
        average_processing_time_ms: 0,
        errors_today: allClients.reduce((sum, c) => sum + c.stats.errors_today, 0),
      },
    };
  }

  async getClientStats(clientId: string): Promise<ClientStatsDetail | null> {
    const client = this.clients.get(toClientId(clientId));
    if (!client) return null;

    return {
      client_id: client.client_id,
      hostname: client.hostname,
      status: client.status,
      total_uploads: client.stats.total_uploads,
      total_records: client.stats.total_records,
      last_upload: client.stats.last_upload,
      last_seen: client.last_seen,
    };
  }
}
