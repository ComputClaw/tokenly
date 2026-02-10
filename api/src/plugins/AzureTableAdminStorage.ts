import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import {
  TableClient,
  TableServiceClient,
  type TableEntity,
} from '@azure/data-tables';
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
import { toEntity, fromEntity, invertedTimestamp } from './tableStorageHelpers.js';

// ── Constants ───────────────────────────────────────────────────────────

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
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
};

interface DefaultSystemConfigEntry {
  readonly key: string;
  readonly value: unknown;
  readonly type: ConfigType;
}

const DEFAULT_SYSTEM_CONFIG: readonly DefaultSystemConfigEntry[] = [
  { key: 'server.auto_approve_clients', value: false, type: 'bool' },
  { key: 'server.max_clients', value: 1000, type: 'int' },
  { key: 'ingestion.rate_limit_per_hour', value: 100, type: 'int' },
  { key: 'ingestion.max_file_size_mb', value: 50, type: 'int' },
  { key: 'audit.retention_days', value: 90, type: 'int' },
];

// ── User entity helpers ─────────────────────────────────────────────────

const USER_NULLABLE: readonly string[] = [
  'last_login', 'disabled_at', 'locked_until',
];
const USER_JSON: readonly string[] = ['permissions'];

function userToEntity(pk: string, rk: string, user: User): TableEntity {
  return toEntity(pk, rk, user as unknown as Record<string, unknown>);
}

function entityToUser(entity: Record<string, unknown>): User {
  return fromEntity<User>(entity, USER_NULLABLE, USER_JSON);
}

// ── ClientInfo entity helpers ───────────────────────────────────────────

const CLIENT_NULLABLE: readonly string[] = [
  'last_seen', 'approved_at', 'approved_by', 'approval_notes',
  'launcher_version', 'worker_version', 'worker_status',
];
const CLIENT_JSON: readonly string[] = ['system_info', 'stats', 'custom_config'];

function clientInfoToEntity(pk: string, rk: string, client: ClientInfo): TableEntity {
  return toEntity(pk, rk, client as unknown as Record<string, unknown>);
}

function entityToClientInfo(entity: Record<string, unknown>): ClientInfo {
  return fromEntity<ClientInfo>(entity, CLIENT_NULLABLE, CLIENT_JSON);
}

// ── AuditAction entity helpers ──────────────────────────────────────────

const AUDIT_NULLABLE: readonly string[] = ['resource_id', 'ip_address', 'user_agent'];
const AUDIT_JSON: readonly string[] = ['details'];

function entityToAuditAction(entity: Record<string, unknown>): AuditAction {
  // Map 'audit_ts' back to 'timestamp' (stored under different name to avoid
  // collision with Azure Table Storage system 'timestamp' property)
  const raw = fromEntity<Record<string, unknown>>(entity, AUDIT_NULLABLE, AUDIT_JSON);
  raw['timestamp'] = raw['audit_ts'];
  delete raw['audit_ts'];
  return raw as unknown as AuditAction;
}

// ── Role → permissions helper ───────────────────────────────────────────

function getPermissionsForRole(role: string): Permission[] {
  if (role in DEFAULT_ROLE_PERMISSIONS) {
    const perms = DEFAULT_ROLE_PERMISSIONS[role as keyof typeof DEFAULT_ROLE_PERMISSIONS];
    return [...perms];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════
// Main plugin
// ═══════════════════════════════════════════════════════════════════════

export class AzureTableAdminStorage implements IAdminStoragePlugin {
  private serviceClient!: TableServiceClient;

  // Table clients
  private usersTable!: TableClient;
  private clientsTable!: TableClient;
  private configTable!: TableClient;
  private overridesTable!: TableClient;
  private auditTable!: TableClient;

  private prefix = 'tokenly';
  private startTime = Date.now();

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async initialize(config: Record<string, unknown>): Promise<void> {
    const connectionString =
      (config['connectionString'] as string | undefined) ??
      process.env['TOKENLY_TABLE_STORAGE_CONNECTION'] ??
      'UseDevelopmentStorage=true';
    this.prefix =
      (config['tablePrefix'] as string | undefined) ??
      process.env['TOKENLY_TABLE_PREFIX'] ??
      'tokenly';

    this.serviceClient = TableServiceClient.fromConnectionString(connectionString);

    const names = {
      users: `${this.prefix}AdminUsers`,
      clients: `${this.prefix}Clients`,
      config: `${this.prefix}Config`,
      overrides: `${this.prefix}ClientConfigOverrides`,
      audit: `${this.prefix}AuditLog`,
    };

    // Create tables (idempotent)
    await Promise.all(Object.values(names).map(n => this.serviceClient.createTable(n).catch(() => { /* already exists */ })));

    this.usersTable = TableClient.fromConnectionString(connectionString, names.users);
    this.clientsTable = TableClient.fromConnectionString(connectionString, names.clients);
    this.configTable = TableClient.fromConnectionString(connectionString, names.config);
    this.overridesTable = TableClient.fromConnectionString(connectionString, names.overrides);
    this.auditTable = TableClient.fromConnectionString(connectionString, names.audit);

    // Seed defaults
    await this.seedDefaults();
  }

  async healthCheck(): Promise<void> {
    // Quick probe — try to list entities; break immediately
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _entity of this.usersTable.listEntities()) {
      break;
    }
  }

  async close(): Promise<void> {
    // Optionally delete tables (useful for tests)
    // In production this is a no-op
  }

  /**
   * Delete all tables created by this instance. Used by tests for cleanup.
   */
  async destroyTables(): Promise<void> {
    const names = [
      `${this.prefix}AdminUsers`,
      `${this.prefix}Clients`,
      `${this.prefix}Config`,
      `${this.prefix}ClientConfigOverrides`,
      `${this.prefix}AuditLog`,
    ];
    await Promise.all(names.map(n => this.serviceClient.deleteTable(n).catch(() => { /* ignore */ })));
  }

  // ── Seed helpers ──────────────────────────────────────────────────────

  private async seedDefaults(): Promise<void> {
    const now = new Date().toISOString();

    // Seed system config
    for (const entry of DEFAULT_SYSTEM_CONFIG) {
      const existing = await this.getConfig(entry.key);
      if (!existing) {
        const cv: ConfigValue = {
          key: entry.key,
          value: entry.value,
          type: entry.type,
          created_at: now,
          updated_at: now,
          updated_by: 'system',
          notes: '',
        };
        await this.upsertConfigEntity(cv);
      }
    }

    // Seed default client config
    const existingDefault = await this.getRawDefaultClientConfig();
    if (!existingDefault) {
      await this.writeDefaultClientConfig(DEFAULT_CLIENT_CONFIG);
    }

    // Seed admin user
    const existingAdmin = await this.getUser('admin');
    if (!existingAdmin) {
      const user = await this.createUser({
        username: 'admin',
        password: 'changeme',
        role: 'super_admin',
        created_by: 'system',
      });
      // Set must_change_password after creation
      const entity = await this.getEntity(this.usersTable, 'users', `name~${user.username}`);
      if (entity) {
        entity['must_change_password'] = true;
        await this.usersTable.upsertEntity(
          { ...entity, partitionKey: 'users', rowKey: `name~${user.username}` } as TableEntity,
          'Replace',
        );
      }
    }
  }

  // ── Users ────────────────────────────────────────────────────────────

  async createUser(input: UserCreate): Promise<User> {
    // Check for existing
    const existing = await this.getEntity(this.usersTable, 'users', `name~${input.username}`);
    if (existing) {
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

    const entity = userToEntity('users', `name~${user.username}`, user);
    await this.usersTable.createEntity(entity);

    return deepClone(user);
  }

  async getUser(username: string): Promise<User | null> {
    const entity = await this.getEntity(this.usersTable, 'users', `name~${username}`);
    if (!entity) return null;
    return entityToUser(entity);
  }

  async getUserById(userId: string): Promise<User | null> {
    // Scan all name~ rows and find by user_id (acceptable at small user counts)
    for await (const entity of this.usersTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'users' and RowKey ge 'name~' and RowKey lt 'namf'` },
    })) {
      if (entity['user_id'] === userId) {
        return entityToUser(entity);
      }
    }
    return null;
  }

  async listUsers(): Promise<User[]> {
    const users: User[] = [];
    for await (const entity of this.usersTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'users' and RowKey ge 'name~' and RowKey lt 'namf'` },
    })) {
      users.push(entityToUser(entity));
    }
    return users;
  }

  async updateUser(username: string, updates: UserUpdate): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new NotFoundError('User', username);

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

    await this.writeUser(user);
  }

  async setUserPassword(username: string, passwordHash: string, _updatedBy: string): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new NotFoundError('User', username);

    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
    await this.writeUser(user);
  }

  async disableUser(username: string, disabledBy: string): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new NotFoundError('User', username);

    const now = new Date().toISOString();
    user.enabled = false;
    user.disabled_at = now;
    user.disabled_by = disabledBy;
    user.updated_at = now;
    await this.writeUser(user);
  }

  async enableUser(username: string, _enabledBy: string): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new NotFoundError('User', username);

    user.enabled = true;
    user.disabled_at = null;
    user.disabled_by = '';
    user.updated_at = new Date().toISOString();
    await this.writeUser(user);
  }

  async deleteUser(username: string, _deletedBy: string): Promise<void> {
    const user = await this.getUser(username);
    if (!user) throw new NotFoundError('User', username);

    await this.usersTable.deleteEntity('users', `name~${user.username}`);
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUser(username);
    if (!user || !user.enabled) return null;

    if (user.locked_until) {
      const lockExpiry = new Date(user.locked_until).getTime();
      if (Date.now() < lockExpiry) return null;
      user.locked_until = null;
      user.failed_attempts = 0;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      user.failed_attempts += 1;
      if (user.failed_attempts >= 5) {
        user.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await this.writeUser(user);
      return null;
    }

    user.failed_attempts = 0;
    user.locked_until = null;
    await this.writeUser(user);
    return deepClone(user);
  }

  private async writeUser(user: User): Promise<void> {
    const entity = userToEntity('users', `name~${user.username}`, user);
    await this.usersTable.upsertEntity(entity, 'Replace');
  }

  // ── Client Management ─────────────────────────────────────────────────

  async registerClient(registration: ClientRegistration): Promise<ClientInfo> {
    // Idempotent: check hostname first
    const existing = await this.getClientByHostname(registration.hostname);
    if (existing) return deepClone(existing);

    const now = new Date().toISOString();
    const clientId = toClientId(uuidv4());

    const client: ClientInfo = {
      client_id: clientId,
      hostname: registration.hostname,
      description: '',
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

    const entity = clientInfoToEntity('clients', `id~${client.client_id}`, client);
    await this.clientsTable.createEntity(entity);
    return deepClone(client);
  }

  async getClient(clientId: string): Promise<ClientInfo | null> {
    const entity = await this.getEntity(this.clientsTable, 'clients', `id~${clientId}`);
    if (!entity) return null;
    return entityToClientInfo(entity);
  }

  async getClientByHostname(hostname: string): Promise<ClientInfo | null> {
    // Scan all id~ rows and find by hostname (acceptable at small client counts)
    for await (const entity of this.clientsTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'clients' and RowKey ge 'id~' and RowKey lt 'ie'` },
    })) {
      if (entity['hostname'] === hostname) {
        return entityToClientInfo(entity);
      }
    }
    return null;
  }

  async updateClient(clientId: string, updates: Partial<ClientInfo>): Promise<void> {
    const client = await this.getClient(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

    if (updates.description !== undefined) client.description = updates.description;
    if (updates.last_seen !== undefined) client.last_seen = updates.last_seen;
    if (updates.launcher_version !== undefined) client.launcher_version = updates.launcher_version;
    if (updates.worker_version !== undefined) client.worker_version = updates.worker_version;
    if (updates.worker_status !== undefined) client.worker_status = updates.worker_status;
    if (updates.system_info !== undefined) (client as { system_info: typeof updates.system_info }).system_info = updates.system_info ?? null;
    if (updates.stats !== undefined) {
      Object.assign(client.stats, updates.stats);
    }
    client.updated_at = new Date().toISOString();

    await this.writeClient(client);
  }

  async listClients(filter: ClientFilter): Promise<ClientList> {
    // Fetch all id~ rows from partition
    let results: ClientInfo[] = [];
    for await (const entity of this.clientsTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'clients' and RowKey ge 'id~' and RowKey lt 'ie'` },
    })) {
      results.push(entityToClientInfo(entity));
    }

    // Apply filters in-memory
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
    const client = await this.getClient(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

    await this.clientsTable.deleteEntity('clients', `id~${client.client_id}`);

    // Also remove config overrides
    await this.overridesTable.deleteEntity('override', clientId).catch(() => { /* ignore */ });
  }

  async setClientStatus(clientId: string, status: ClientStatus, approvedBy: string, notes?: string): Promise<void> {
    const client = await this.getClient(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

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

    await this.writeClient(client);
  }

  async getPendingClients(): Promise<ClientInfo[]> {
    const all: ClientInfo[] = [];
    for await (const entity of this.clientsTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'clients' and RowKey ge 'id~' and RowKey lt 'ie'` },
    })) {
      const client = entityToClientInfo(entity);
      if (client.status === 'pending') {
        all.push(client);
      }
    }
    return all;
  }

  private async writeClient(client: ClientInfo): Promise<void> {
    const entity = clientInfoToEntity('clients', `id~${client.client_id}`, client);
    await this.clientsTable.upsertEntity(entity, 'Replace');
  }

  // ── Configuration ─────────────────────────────────────────────────────

  async getConfig(key: string): Promise<ConfigValue | null> {
    const entity = await this.getEntity(this.configTable, 'config', key);
    if (!entity) return null;
    return this.entityToConfigValue(entity);
  }

  async setConfig(key: string, value: unknown, updatedBy: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getConfig(key);
    const configType: ConfigType = typeof value === 'boolean' ? 'bool'
      : typeof value === 'number' ? 'int'
      : typeof value === 'object' ? 'json'
      : 'string';

    const cv: ConfigValue = {
      key,
      value,
      type: existing?.type ?? configType,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      updated_by: updatedBy,
      notes: existing?.notes ?? '',
    };
    await this.upsertConfigEntity(cv);
  }

  async listConfig(prefix: string): Promise<ConfigValue[]> {
    const results: ConfigValue[] = [];
    // We can't do prefix filter on RowKey easily with OData, so fetch all config rows
    for await (const entity of this.configTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'config'` },
    })) {
      const cv = this.entityToConfigValue(entity);
      if (cv.key.startsWith(prefix)) {
        results.push(cv);
      }
    }
    return results;
  }

  async deleteConfig(key: string, _deletedBy: string): Promise<void> {
    await this.configTable.deleteEntity('config', key).catch(() => { /* ignore */ });
  }

  async getDefaultClientConfig(): Promise<ClientConfig> {
    const raw = await this.getRawDefaultClientConfig();
    if (!raw) return deepClone(DEFAULT_CLIENT_CONFIG);
    return raw;
  }

  async setDefaultClientConfig(config: ClientConfig, _updatedBy: string): Promise<void> {
    await this.writeDefaultClientConfig(config);
  }

  private async getRawDefaultClientConfig(): Promise<ClientConfig | null> {
    const entity = await this.getEntity(this.configTable, 'clientconfig', 'default');
    if (!entity) return null;
    const json = entity['config_json'] as string | undefined;
    if (!json) return null;
    return JSON.parse(json) as ClientConfig;
  }

  private async writeDefaultClientConfig(config: ClientConfig): Promise<void> {
    await this.configTable.upsertEntity({
      partitionKey: 'clientconfig',
      rowKey: 'default',
      config_json: JSON.stringify(config),
    }, 'Replace');
  }

  private async upsertConfigEntity(cv: ConfigValue): Promise<void> {
    const entity: Record<string, unknown> = {
      partitionKey: 'config',
      rowKey: cv.key,
      key: cv.key,
      type: cv.type,
      created_at: cv.created_at,
      updated_at: cv.updated_at,
      updated_by: cv.updated_by,
      notes: cv.notes,
    };
    // Store value — always as JSON string for consistency
    entity['value_json'] = JSON.stringify(cv.value);
    await this.configTable.upsertEntity(entity as TableEntity, 'Replace');
  }

  private entityToConfigValue(entity: Record<string, unknown>): ConfigValue {
    const valueJson = entity['value_json'] as string | undefined;
    let value: unknown = null;
    if (valueJson && valueJson.length > 0) {
      value = JSON.parse(valueJson);
    }
    return {
      key: entity['key'] as string,
      value,
      type: entity['type'] as ConfigType,
      created_at: entity['created_at'] as string,
      updated_at: entity['updated_at'] as string,
      updated_by: entity['updated_by'] as string,
      notes: (entity['notes'] as string) ?? '',
    };
  }

  // ── Per-Client Config Overrides ───────────────────────────────────────

  async getClientConfig(clientId: string): Promise<ClientConfig | null> {
    const client = await this.getClient(clientId);
    if (!client) return null;

    const defaults = await this.getDefaultClientConfig();
    const overrideEntity = await this.getEntity(this.overridesTable, 'override', clientId);
    if (overrideEntity) {
      const overridesJson = overrideEntity['overrides_json'] as string | undefined;
      if (overridesJson) {
        const overrides = JSON.parse(overridesJson) as Record<string, unknown>;
        return { ...defaults, ...overrides } as ClientConfig;
      }
    }
    return defaults;
  }

  async setClientConfigOverride(clientId: string, overrides: Record<string, unknown>, updatedBy: string): Promise<void> {
    const client = await this.getClient(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

    const now = new Date().toISOString();
    const existing = await this.getEntity(this.overridesTable, 'override', clientId);

    const entity: Record<string, unknown> = {
      partitionKey: 'override',
      rowKey: clientId,
      client_id: clientId,
      overrides_json: JSON.stringify(overrides),
      created_at: existing ? (existing['created_at'] as string) : now,
      updated_at: now,
      updated_by: updatedBy,
    };
    await this.overridesTable.upsertEntity(entity as TableEntity, 'Replace');
  }

  async removeClientConfigOverride(clientId: string, _updatedBy: string): Promise<void> {
    await this.overridesTable.deleteEntity('override', clientId).catch(() => { /* ignore */ });
  }

  async listClientConfigOverrides(): Promise<ClientConfigOverride[]> {
    const results: ClientConfigOverride[] = [];
    for await (const entity of this.overridesTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'override'` },
    })) {
      const overridesJson = entity['overrides_json'] as string | undefined;
      const overrides = overridesJson ? JSON.parse(overridesJson) as Record<string, unknown> : {};
      results.push({
        client_id: toClientId(entity['client_id'] as string),
        overrides,
        created_at: entity['created_at'] as string,
        updated_at: entity['updated_at'] as string,
        updated_by: entity['updated_by'] as string,
      });
    }
    return results;
  }

  // ── Audit ─────────────────────────────────────────────────────────────

  async logAdminAction(action: Omit<AuditAction, 'id' | 'timestamp'>): Promise<void> {
    const id = toAuditId(uuidv4());
    const auditTimestamp = new Date().toISOString();
    const ts = Date.now();
    const rowKey = `${invertedTimestamp(ts)}_${id}`;

    // Store timestamp as 'audit_ts' to avoid collision with Azure Table system 'timestamp'
    const record: Record<string, unknown> = {
      id,
      audit_ts: auditTimestamp,
      ...action,
    };
    const entity = toEntity('audit', rowKey, record);
    await this.auditTable.createEntity(entity);
  }

  async getAuditLog(filter: AuditFilter): Promise<{ entries: AuditAction[]; total: number }> {
    // Build OData filter parts
    const filterParts: string[] = [`PartitionKey eq 'audit'`];

    // Use inverted timestamp for date range bounds on rowKey
    if (filter.timestamp_before) {
      const beforeMs = new Date(filter.timestamp_before).getTime();
      const lowerBound = invertedTimestamp(beforeMs);
      filterParts.push(`RowKey ge '${lowerBound}'`);
    }
    if (filter.timestamp_after) {
      const afterMs = new Date(filter.timestamp_after).getTime();
      const upperBound = invertedTimestamp(afterMs);
      filterParts.push(`RowKey le '${upperBound}_~'`);
    }

    const odata = filterParts.join(' and ');
    let results: AuditAction[] = [];

    for await (const entity of this.auditTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: odata },
    })) {
      results.push(entityToAuditAction(entity));
    }

    // Apply remaining filters in-memory
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

    // Already ordered newest-first by rowKey (inverted timestamp)
    const total = results.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    const entries = results.slice(offset, offset + limit).map(a => deepClone(a));
    return { entries, total };
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async getSystemStats(): Promise<SystemStats> {
    const allClients: ClientInfo[] = [];
    for await (const entity of this.clientsTable.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq 'clients' and RowKey ge 'id~' and RowKey lt 'ie'` },
    })) {
      allClients.push(entityToClientInfo(entity));
    }

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
        backend: 'azure_table',
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
    const client = await this.getClient(clientId);
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

  // ── Private helpers ───────────────────────────────────────────────────

  private async getEntity(table: TableClient, pk: string, rk: string): Promise<Record<string, unknown> | null> {
    try {
      return await table.getEntity<Record<string, unknown>>(pk, rk);
    } catch (e: unknown) {
      if (isResourceNotFoundError(e)) return null;
      throw e;
    }
  }
}

// ── Utility ─────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function isResourceNotFoundError(e: unknown): boolean {
  if (e && typeof e === 'object' && 'statusCode' in e) {
    return (e as { statusCode: number }).statusCode === 404;
  }
  return false;
}
