/**
 * Integration tests for AzureTableAdminStorage.
 *
 * Requires Azurite table service running on 127.0.0.1:10002.
 * Start with: npx azurite-table --tableHost 127.0.0.1 --tablePort 10002
 *
 * Each test run uses a unique table prefix to avoid collisions.
 */
import { AzureTableAdminStorage } from './AzureTableAdminStorage';
import { ConflictError, NotFoundError } from '../models/result';

const CONNECTION = 'UseDevelopmentStorage=true';
const PREFIX = `test${Date.now()}`;

let storage: AzureTableAdminStorage;

beforeAll(async () => {
  storage = new AzureTableAdminStorage();
  await storage.initialize({
    connectionString: CONNECTION,
    tablePrefix: PREFIX,
  });
}, 30_000);

afterAll(async () => {
  await storage.destroyTables();
  await storage.close();
}, 30_000);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('initialize', () => {
  it('seeds default admin user', async () => {
    const admin = await storage.getAdminUser('admin');
    expect(admin).not.toBeNull();
    expect(admin!.username).toBe('admin');
    expect(admin!.role).toBe('super_admin');
    expect(admin!.must_change_password).toBe(true);
  });

  it('seeds default system configuration', async () => {
    const cfg = await storage.getConfig('server.auto_approve_clients');
    expect(cfg).not.toBeNull();
    expect(cfg!.value).toBe(false);

    const maxClients = await storage.getConfig('server.max_clients');
    expect(maxClients).not.toBeNull();
    expect(maxClients!.value).toBe(1000);
  });

  it('seeds default client config', async () => {
    const config = await storage.getDefaultClientConfig();
    expect(config.scan_enabled).toBe(true);
    expect(config.scan_interval_minutes).toBe(60);
    expect(config.heartbeat_interval_seconds).toBe(3600);
  });

  it('healthCheck does not throw', async () => {
    await expect(storage.healthCheck()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Admin Users
// ---------------------------------------------------------------------------

describe('Admin Users', () => {
  it('createAdminUser succeeds with valid input', async () => {
    const user = await storage.createAdminUser({
      username: 'testuser',
      password: 'password123',
      role: 'viewer',
      created_by: 'admin',
    });
    expect(user.username).toBe('testuser');
    expect(user.role).toBe('viewer');
    expect(user.enabled).toBe(true);
    expect(user.user_id).toBeDefined();
  });

  it('createAdminUser returns user with password_hash present (deep clone)', async () => {
    const user = await storage.createAdminUser({
      username: 'testuser2',
      password: 'password123',
      role: 'viewer',
      created_by: 'admin',
    });
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash).not.toBe('password123');
  });

  it('createAdminUser fails on duplicate username', async () => {
    await expect(
      storage.createAdminUser({
        username: 'admin',
        password: 'another',
        role: 'viewer',
        created_by: 'system',
      })
    ).rejects.toThrow(ConflictError);
  });

  it('createAdminUser assigns default permissions for role', async () => {
    const user = await storage.createAdminUser({
      username: 'manager1',
      password: 'pass',
      role: 'client_manager',
      created_by: 'admin',
    });
    expect(user.permissions).toContain('client:approve');
    expect(user.permissions).toContain('config:read');
    expect(user.permissions).not.toContain('user:create');
  });

  it('createAdminUser uses custom permissions when provided', async () => {
    const user = await storage.createAdminUser({
      username: 'custom1',
      password: 'pass',
      role: 'custom',
      custom_permissions: ['config:read', 'audit:read'],
      created_by: 'admin',
    });
    expect(user.permissions).toEqual(['config:read', 'audit:read']);
  });

  it('getAdminUser returns user by username', async () => {
    const user = await storage.getAdminUser('admin');
    expect(user).not.toBeNull();
    expect(user!.username).toBe('admin');
  });

  it('getAdminUser returns null for non-existent user', async () => {
    const user = await storage.getAdminUser('nonexistent');
    expect(user).toBeNull();
  });

  it('validatePassword returns user on correct password', async () => {
    const user = await storage.validatePassword('admin', 'changeme');
    expect(user).not.toBeNull();
    expect(user!.username).toBe('admin');
  });

  it('validatePassword returns null on wrong password', async () => {
    const user = await storage.validatePassword('admin', 'wrongpassword');
    expect(user).toBeNull();
  });

  it('validatePassword returns null for disabled user', async () => {
    await storage.createAdminUser({
      username: 'disabletest',
      password: 'pass123',
      role: 'viewer',
      created_by: 'admin',
    });
    await storage.disableAdminUser('disabletest', 'system');
    const user = await storage.validatePassword('disabletest', 'pass123');
    expect(user).toBeNull();
  });

  it('validatePassword returns null for non-existent user', async () => {
    const user = await storage.validatePassword('nobody', 'pass');
    expect(user).toBeNull();
  });

  it('disableAdminUser sets enabled=false', async () => {
    await storage.createAdminUser({
      username: 'disabletest2',
      password: 'pass',
      role: 'viewer',
      created_by: 'admin',
    });
    await storage.disableAdminUser('disabletest2', 'system');
    const user = await storage.getAdminUser('disabletest2');
    expect(user!.enabled).toBe(false);
    expect(user!.disabled_at).not.toBeNull();
    expect(user!.disabled_by).toBe('system');
  });

  it('enableAdminUser sets enabled=true', async () => {
    await storage.createAdminUser({
      username: 'enabletest',
      password: 'pass',
      role: 'viewer',
      created_by: 'admin',
    });
    await storage.disableAdminUser('enabletest', 'system');
    await storage.enableAdminUser('enabletest', 'system');
    const user = await storage.getAdminUser('enabletest');
    expect(user!.enabled).toBe(true);
    expect(user!.disabled_at).toBeNull();
  });

  it('setAdminUserPassword changes the password', async () => {
    await storage.createAdminUser({
      username: 'pwdtest',
      password: 'oldpass',
      role: 'viewer',
      created_by: 'admin',
    });
    const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
    const newHash = await bcrypt.hash('newpass123', 12);
    await storage.setAdminUserPassword('pwdtest', newHash, 'admin');

    const oldResult = await storage.validatePassword('pwdtest', 'oldpass');
    expect(oldResult).toBeNull();

    const newResult = await storage.validatePassword('pwdtest', 'newpass123');
    expect(newResult).not.toBeNull();
  });

  it('listAdminUsers returns all users', async () => {
    const users = await storage.listAdminUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    const names = users.map(u => u.username);
    expect(names).toContain('admin');
    expect(names).toContain('testuser');
  });

  it('deleteAdminUser removes the user', async () => {
    await storage.createAdminUser({
      username: 'todelete',
      password: 'pass',
      role: 'viewer',
      created_by: 'admin',
    });
    await storage.deleteAdminUser('todelete', 'admin');
    const user = await storage.getAdminUser('todelete');
    expect(user).toBeNull();
  });

  it('deleteAdminUser throws NotFoundError for non-existent user', async () => {
    await expect(
      storage.deleteAdminUser('nonexistent', 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('disableAdminUser throws NotFoundError for non-existent user', async () => {
    await expect(
      storage.disableAdminUser('nonexistent', 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('enableAdminUser throws NotFoundError for non-existent user', async () => {
    await expect(
      storage.enableAdminUser('nonexistent', 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('setAdminUserPassword throws NotFoundError for non-existent user', async () => {
    await expect(
      storage.setAdminUserPassword('nonexistent', 'hash', 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('getAdminUserById returns correct user', async () => {
    const created = await storage.createAdminUser({
      username: 'byid',
      password: 'pass',
      role: 'viewer',
      created_by: 'admin',
    });
    const found = await storage.getAdminUserById(created.user_id);
    expect(found).not.toBeNull();
    expect(found!.username).toBe('byid');
  });

  it('getAdminUserById returns null for non-existent id', async () => {
    const found = await storage.getAdminUserById('nonexistent-id');
    expect(found).toBeNull();
  });

  it('validatePassword locks account after 5 failed attempts', async () => {
    await storage.createAdminUser({
      username: 'locktest',
      password: 'correctpass',
      role: 'viewer',
      created_by: 'admin',
    });
    for (let i = 0; i < 5; i++) {
      await storage.validatePassword('locktest', 'wrongpassword');
    }
    const user = await storage.validatePassword('locktest', 'correctpass');
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Client Management
// ---------------------------------------------------------------------------

describe('Client Management', () => {
  it('registerClient creates new client with status=pending', async () => {
    const client = await storage.registerClient({ hostname: 'host1.example.com' });
    expect(client.hostname).toBe('host1.example.com');
    expect(client.status).toBe('pending');
    expect(client.client_id).toBeDefined();
  });

  it('registerClient returns existing client on same hostname (idempotent)', async () => {
    const first = await storage.registerClient({ hostname: 'host1.example.com' });
    const second = await storage.registerClient({ hostname: 'host1.example.com' });
    expect(first.client_id).toBe(second.client_id);
  });

  it('getClient returns correct client', async () => {
    const created = await storage.registerClient({ hostname: 'host2.example.com' });
    const found = await storage.getClient(created.client_id);
    expect(found).not.toBeNull();
    expect(found!.hostname).toBe('host2.example.com');
  });

  it('getClient returns null for non-existent id', async () => {
    const found = await storage.getClient('nonexistent-id');
    expect(found).toBeNull();
  });

  it('getClientByHostname returns correct client', async () => {
    await storage.registerClient({ hostname: 'host3.example.com' });
    const found = await storage.getClientByHostname('host3.example.com');
    expect(found).not.toBeNull();
    expect(found!.hostname).toBe('host3.example.com');
  });

  it('getClientByHostname returns null for non-existent hostname', async () => {
    const found = await storage.getClientByHostname('nonexistent.example.com');
    expect(found).toBeNull();
  });

  it('setClientStatus changes status and records approved_by', async () => {
    const client = await storage.registerClient({ hostname: 'host4.example.com' });
    await storage.setClientStatus(client.client_id, 'approved', 'admin', 'Looks good');

    const updated = await storage.getClient(client.client_id);
    expect(updated!.status).toBe('approved');
    expect(updated!.approved_by).toBe('admin');
    expect(updated!.approved_at).not.toBeNull();
    expect(updated!.approval_notes).toBe('Looks good');
  });

  it('setClientStatus throws NotFoundError for non-existent client', async () => {
    await expect(
      storage.setClientStatus('nonexistent-id', 'approved', 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('listClients with status filter', async () => {
    await storage.registerClient({ hostname: 'a-list.example.com' });
    const client2 = await storage.registerClient({ hostname: 'b-list.example.com' });
    await storage.setClientStatus(client2.client_id, 'approved', 'admin');

    const pending = await storage.listClients({ status: ['pending'] });
    expect(pending.clients.every(c => c.status === 'pending')).toBe(true);

    const approved = await storage.listClients({ status: ['approved'] });
    expect(approved.clients.every(c => c.status === 'approved')).toBe(true);
  });

  it('listClients with hostname search', async () => {
    await storage.registerClient({ hostname: 'alpha-search.example.com' });
    await storage.registerClient({ hostname: 'beta-search.example.com' });

    const result = await storage.listClients({ hostname: 'alpha-search' });
    expect(result.clients.length).toBe(1);
    expect(result.clients[0]!.hostname).toBe('alpha-search.example.com');
  });

  it('listClients with pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.registerClient({ hostname: `paghost${i}.example.com` });
    }
    const all = await storage.listClients({ hostname: 'paghost' });
    expect(all.total).toBe(5);

    const page1 = await storage.listClients({ hostname: 'paghost', limit: 2, offset: 0 });
    expect(page1.clients.length).toBe(2);
    expect(page1.total).toBe(5);

    const page2 = await storage.listClients({ hostname: 'paghost', limit: 2, offset: 2 });
    expect(page2.clients.length).toBe(2);
    expect(page2.offset).toBe(2);
  });

  it('getPendingClients returns only pending clients', async () => {
    const client1 = await storage.registerClient({ hostname: 'p1-pend.example.com' });
    await storage.registerClient({ hostname: 'p2-pend.example.com' });
    await storage.setClientStatus(client1.client_id, 'approved', 'admin');

    const pending = await storage.getPendingClients();
    expect(pending.every(c => c.status === 'pending')).toBe(true);
    expect(pending.some(c => c.hostname === 'p2-pend.example.com')).toBe(true);
    expect(pending.some(c => c.hostname === 'p1-pend.example.com')).toBe(false);
  });

  it('deleteClient removes the client', async () => {
    const client = await storage.registerClient({ hostname: 'del.example.com' });
    await storage.deleteClient(client.client_id);
    const found = await storage.getClient(client.client_id);
    expect(found).toBeNull();
    const byHost = await storage.getClientByHostname('del.example.com');
    expect(byHost).toBeNull();
  });

  it('deleteClient throws NotFoundError for non-existent client', async () => {
    await expect(
      storage.deleteClient('nonexistent-id')
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('Configuration', () => {
  it('getConfig returns seeded config', async () => {
    const val = await storage.getConfig('server.auto_approve_clients');
    expect(val).not.toBeNull();
    expect(val!.value).toBe(false);
    expect(val!.type).toBe('bool');
  });

  it('getConfig returns null for non-existent key', async () => {
    const val = await storage.getConfig('nonexistent.key');
    expect(val).toBeNull();
  });

  it('setConfig creates new config entry', async () => {
    await storage.setConfig('custom.setting', 'hello', 'admin');
    const val = await storage.getConfig('custom.setting');
    expect(val).not.toBeNull();
    expect(val!.value).toBe('hello');
    expect(val!.updated_by).toBe('admin');
  });

  it('setConfig updates existing config entry', async () => {
    await storage.setConfig('server.max_clients', 2000, 'admin');
    const val = await storage.getConfig('server.max_clients');
    expect(val!.value).toBe(2000);
    expect(val!.updated_by).toBe('admin');
  });

  it('getDefaultClientConfig returns seeded defaults', async () => {
    const config = await storage.getDefaultClientConfig();
    expect(config.scan_enabled).toBe(true);
    expect(config.scan_interval_minutes).toBe(60);
    expect(config.file_patterns).toContain('*.jsonl');
    expect(config.heartbeat_interval_seconds).toBe(3600);
  });

  it('setDefaultClientConfig updates defaults', async () => {
    const current = await storage.getDefaultClientConfig();
    const updated = { ...current, scan_interval_minutes: 120 };
    await storage.setDefaultClientConfig(updated, 'admin');

    const result = await storage.getDefaultClientConfig();
    expect(result.scan_interval_minutes).toBe(120);

    // Restore for other tests
    await storage.setDefaultClientConfig({ ...current }, 'admin');
  });

  it('getClientConfig merges defaults with overrides', async () => {
    const client = await storage.registerClient({ hostname: 'cfg.example.com' });
    await storage.setClientConfigOverride(
      client.client_id,
      { scan_interval_minutes: 30, log_level: 'debug' },
      'admin'
    );

    const config = await storage.getClientConfig(client.client_id);
    expect(config).not.toBeNull();
    expect(config!.scan_interval_minutes).toBe(30);
    expect(config!.log_level).toBe('debug');
    expect(config!.scan_enabled).toBe(true);
    expect(config!.heartbeat_interval_seconds).toBe(3600);
  });

  it('getClientConfig returns defaults when no overrides', async () => {
    const client = await storage.registerClient({ hostname: 'noover.example.com' });
    const config = await storage.getClientConfig(client.client_id);
    const defaults = await storage.getDefaultClientConfig();
    expect(config).toEqual(defaults);
  });

  it('getClientConfig returns null for non-existent client', async () => {
    const config = await storage.getClientConfig('nonexistent-id');
    expect(config).toBeNull();
  });

  it('setClientConfigOverride throws NotFoundError for non-existent client', async () => {
    await expect(
      storage.setClientConfigOverride('nonexistent-id', {}, 'admin')
    ).rejects.toThrow(NotFoundError);
  });

  it('removeClientConfigOverride removes the override', async () => {
    const client = await storage.registerClient({ hostname: 'rmover.example.com' });
    await storage.setClientConfigOverride(
      client.client_id,
      { scan_interval_minutes: 5 },
      'admin'
    );
    await storage.removeClientConfigOverride(client.client_id, 'admin');

    const config = await storage.getClientConfig(client.client_id);
    const defaults = await storage.getDefaultClientConfig();
    expect(config).toEqual(defaults);
  });

  it('listConfig filters by prefix', async () => {
    const serverConfigs = await storage.listConfig('server.');
    expect(serverConfigs.length).toBeGreaterThanOrEqual(2);
    expect(serverConfigs.every(c => c.key.startsWith('server.'))).toBe(true);
  });

  it('deleteConfig removes config entry', async () => {
    await storage.setConfig('temp.key', 'value', 'admin');
    await storage.deleteConfig('temp.key', 'admin');
    const val = await storage.getConfig('temp.key');
    expect(val).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe('Audit', () => {
  it('logAdminAction stores entry', async () => {
    await storage.logAdminAction({
      user_id: 'admin',
      action: 'client_approve',
      resource: 'client',
      resource_id: 'client-123',
      details: { notes: 'Approved' },
      ip_address: '127.0.0.1',
      user_agent: 'test',
    });

    const result = await storage.getAuditLog({});
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const entry = result.entries.find(e => e.resource_id === 'client-123');
    expect(entry).toBeDefined();
    expect(entry!.action).toBe('client_approve');
    expect(entry!.user_id).toBe('admin');
  });

  it('getAuditLog filters by user_id', async () => {
    await storage.logAdminAction({
      user_id: 'alice',
      action: 'config_set',
      resource: 'config',
      resource_id: 'key1',
      details: null,
      ip_address: null,
      user_agent: null,
    });
    await storage.logAdminAction({
      user_id: 'bob',
      action: 'config_set',
      resource: 'config',
      resource_id: 'key2',
      details: null,
      ip_address: null,
      user_agent: null,
    });

    const result = await storage.getAuditLog({ user_id: 'alice' });
    expect(result.entries.every(e => e.user_id === 'alice')).toBe(true);
  });

  it('getAuditLog filters by action', async () => {
    await storage.logAdminAction({
      user_id: 'admin',
      action: 'user_create',
      resource: 'user',
      resource_id: 'u1',
      details: null,
      ip_address: null,
      user_agent: null,
    });

    const result = await storage.getAuditLog({ actions: ['user_create'] });
    expect(result.entries.every(e => e.action === 'user_create')).toBe(true);
  });

  it('getAuditLog filters by date range', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 100000);

    await storage.logAdminAction({
      user_id: 'admin',
      action: 'client_approve',
      resource: 'client',
      resource_id: 'c1-date',
      details: null,
      ip_address: null,
      user_agent: null,
    });

    const result = await storage.getAuditLog({
      timestamp_after: past.toISOString(),
      timestamp_before: new Date(now.getTime() + 100000).toISOString(),
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('getAuditLog pagination works', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.logAdminAction({
        user_id: 'paginationuser',
        action: 'config_set',
        resource: 'config',
        resource_id: `pag-key-${i}`,
        details: null,
        ip_address: null,
        user_agent: null,
      });
    }

    const all = await storage.getAuditLog({ user_id: 'paginationuser' });
    expect(all.total).toBeGreaterThanOrEqual(5);

    const page1 = await storage.getAuditLog({ user_id: 'paginationuser', limit: 2, offset: 0 });
    expect(page1.entries.length).toBe(2);

    const page2 = await storage.getAuditLog({ user_id: 'paginationuser', limit: 2, offset: 2 });
    expect(page2.entries.length).toBe(2);
  });

  it('audit entries have id and timestamp', async () => {
    await storage.logAdminAction({
      user_id: 'admin',
      action: 'admin_login',
      resource: 'system',
      resource_id: null,
      details: null,
      ip_address: null,
      user_agent: null,
    });

    const result = await storage.getAuditLog({ actions: ['admin_login'] });
    const entry = result.entries[0];
    expect(entry!.id).toBeDefined();
    expect(entry!.timestamp).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('Stats', () => {
  it('getSystemStats returns valid stats', async () => {
    const stats = await storage.getSystemStats();
    expect(stats.version).toBe('1.0.0');
    expect(stats.storage.backend).toBe('azure_table');
    expect(stats.clients.total).toBeGreaterThanOrEqual(0);
  });

  it('getClientStats returns stats for existing client', async () => {
    const client = await storage.registerClient({ hostname: 'stats.example.com' });
    const stats = await storage.getClientStats(client.client_id);
    expect(stats).not.toBeNull();
    expect(stats!.hostname).toBe('stats.example.com');
    expect(stats!.total_uploads).toBe(0);
  });

  it('getClientStats returns null for non-existent client', async () => {
    const stats = await storage.getClientStats('nonexistent-id');
    expect(stats).toBeNull();
  });
});
