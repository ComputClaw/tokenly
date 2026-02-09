import { AdminService } from './AdminService';
import { InMemoryAdminStorage } from '../plugins/InMemoryAdminStorage';

let storage: InMemoryAdminStorage;
let service: AdminService;

beforeEach(async () => {
  storage = new InMemoryAdminStorage();
  await storage.initialize({});
  service = new AdminService(storage);
});

afterEach(async () => {
  await storage.close();
});

describe('AdminService', () => {
  describe('Client management with audit', () => {
    it('approveClient logs audit action', async () => {
      const client = await storage.registerClient({ hostname: 'audit-approve.example.com' });
      await service.approveClient(client.client_id, 'admin', 'Looks good', '127.0.0.1');

      // Verify client was approved
      const updated = await storage.getClient(client.client_id);
      expect(updated!.status).toBe('approved');

      // Verify audit entry
      const audit = await storage.getAuditLog({ actions: ['client_approve'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
      const entry = audit.entries.find(e => e.resource_id === client.client_id);
      expect(entry).toBeDefined();
      expect(entry!.user_id).toBe('admin');
      expect(entry!.action).toBe('client_approve');
      expect(entry!.resource).toBe('client');
      expect(entry!.ip_address).toBe('127.0.0.1');
    });

    it('rejectClient logs audit action', async () => {
      const client = await storage.registerClient({ hostname: 'audit-reject.example.com' });
      await service.rejectClient(client.client_id, 'admin', 'Suspicious');

      const updated = await storage.getClient(client.client_id);
      expect(updated!.status).toBe('rejected');

      const audit = await storage.getAuditLog({ actions: ['client_reject'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
      const entry = audit.entries.find(e => e.resource_id === client.client_id);
      expect(entry).toBeDefined();
      expect(entry!.action).toBe('client_reject');
    });

    it('suspendClient logs audit action', async () => {
      const client = await storage.registerClient({ hostname: 'audit-suspend.example.com' });
      await storage.setClientStatus(client.client_id, 'approved', 'admin');
      await service.suspendClient(client.client_id, 'admin', 'Policy violation');

      const updated = await storage.getClient(client.client_id);
      expect(updated!.status).toBe('suspended');

      const audit = await storage.getAuditLog({ actions: ['client_suspend'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });

    it('deleteClient logs audit action', async () => {
      const client = await storage.registerClient({ hostname: 'audit-delete.example.com' });
      await service.deleteClient(client.client_id, 'admin');

      const deleted = await storage.getClient(client.client_id);
      expect(deleted).toBeNull();

      const audit = await storage.getAuditLog({ actions: ['client_delete'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('User management with audit', () => {
    it('createUser logs audit action', async () => {
      const user = await service.createUser(
        { username: 'newuser', password: 'pass123', role: 'viewer', created_by: 'admin' },
        'admin',
        '127.0.0.1'
      );

      expect(user.username).toBe('newuser');

      const audit = await storage.getAuditLog({ actions: ['user_create'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
      const entry = audit.entries.find(e => e.resource_id === user.user_id);
      expect(entry).toBeDefined();
      expect(entry!.action).toBe('user_create');
      expect(entry!.user_id).toBe('admin');
    });

    it('disableUser logs audit action', async () => {
      await service.createUser(
        { username: 'todisable', password: 'pass', role: 'viewer', created_by: 'admin' },
        'admin'
      );
      await service.disableUser('todisable', 'admin', '10.0.0.1');

      const user = await storage.getAdminUser('todisable');
      expect(user!.enabled).toBe(false);

      const audit = await storage.getAuditLog({ actions: ['user_disable'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });

    it('enableUser logs audit action', async () => {
      await service.createUser(
        { username: 'toenable', password: 'pass', role: 'viewer', created_by: 'admin' },
        'admin'
      );
      await service.disableUser('toenable', 'admin');
      await service.enableUser('toenable', 'admin');

      const user = await storage.getAdminUser('toenable');
      expect(user!.enabled).toBe(true);

      const audit = await storage.getAuditLog({ actions: ['user_enable'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });

    it('deleteUser logs audit action', async () => {
      await service.createUser(
        { username: 'todel', password: 'pass', role: 'viewer', created_by: 'admin' },
        'admin'
      );
      await service.deleteUser('todel', 'admin');

      const user = await storage.getAdminUser('todel');
      expect(user).toBeNull();

      const audit = await storage.getAuditLog({ actions: ['user_delete'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });

    it('changePassword logs audit action', async () => {
      const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
      const hash = await bcrypt.hash('newpass', 12);
      await service.changePassword('admin', hash, 'admin', '10.0.0.1');

      const audit = await storage.getAuditLog({ actions: ['password_change'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
      expect(audit.entries[0]!.resource_id).toBe('admin');
    });
  });

  describe('Config changes with audit', () => {
    it('setConfig logs audit action', async () => {
      await service.setConfig('test.key', 'test-value', 'admin', '127.0.0.1');

      const val = await storage.getConfig('test.key');
      expect(val!.value).toBe('test-value');

      const audit = await storage.getAuditLog({ actions: ['config_set'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
      const entry = audit.entries.find(e => e.resource_id === 'test.key');
      expect(entry).toBeDefined();
      expect(entry!.action).toBe('config_set');
    });

    it('deleteConfig logs audit action', async () => {
      await storage.setConfig('temp.key', 'val', 'admin');
      await service.deleteConfig('temp.key', 'admin', '127.0.0.1');

      const val = await storage.getConfig('temp.key');
      expect(val).toBeNull();

      const audit = await storage.getAuditLog({ actions: ['config_delete'] });
      expect(audit.entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Read operations', () => {
    it('getUser returns user', async () => {
      const user = await service.getUser('admin');
      expect(user).not.toBeNull();
      expect(user!.username).toBe('admin');
    });

    it('listUsers returns all users', async () => {
      const users = await service.listUsers();
      expect(users.length).toBeGreaterThanOrEqual(1);
    });

    it('listClients works with filters', async () => {
      await storage.registerClient({ hostname: 'read-test.example.com' });
      const result = await service.listClients({ hostname: 'read-test' });
      expect(result.clients.length).toBe(1);
    });

    it('getPendingClients returns pending', async () => {
      await storage.registerClient({ hostname: 'pending-read.example.com' });
      const pending = await service.getPendingClients();
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.every(c => c.status === 'pending')).toBe(true);
    });

    it('getAuditLog returns entries', async () => {
      await service.setConfig('audit.test', true, 'admin');
      const result = await service.getAuditLog({});
      expect(result.total).toBeGreaterThanOrEqual(1);
    });

    it('getClientSummary returns correct counts', async () => {
      const c1 = await storage.registerClient({ hostname: 'sum1.example.com' });
      await storage.registerClient({ hostname: 'sum2.example.com' });
      await storage.setClientStatus(c1.client_id, 'approved', 'admin');

      const summary = await service.getClientSummary();
      expect(summary.approved).toBeGreaterThanOrEqual(1);
      expect(summary.pending).toBeGreaterThanOrEqual(1);
    });

    it('getConfig returns config value', async () => {
      const val = await service.getConfig('server.max_clients');
      expect(val).not.toBeNull();
      expect(val!.value).toBe(1000);
    });

    it('listConfig with prefix', async () => {
      const configs = await service.listConfig('server.');
      expect(configs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
