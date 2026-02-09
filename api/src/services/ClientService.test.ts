import { ClientService } from './ClientService';
import { InMemoryAdminStorage } from '../plugins/InMemoryAdminStorage';
import { InMemoryTokenStorage } from '../plugins/InMemoryTokenStorage';
import type { HeartbeatRequest, IngestRequest } from './ClientService';

let adminStorage: InMemoryAdminStorage;
let tokenStorage: InMemoryTokenStorage;
let service: ClientService;

beforeEach(async () => {
  adminStorage = new InMemoryAdminStorage();
  await adminStorage.initialize({});
  tokenStorage = new InMemoryTokenStorage();
  await tokenStorage.initialize({});
  service = new ClientService(adminStorage, tokenStorage);
});

afterEach(async () => {
  await adminStorage.close();
  await tokenStorage.close();
});

function makeHeartbeat(hostname: string, overrides: Partial<HeartbeatRequest> = {}): HeartbeatRequest {
  return {
    client_hostname: hostname,
    timestamp: new Date().toISOString(),
    launcher_version: '1.0.0',
    worker_version: '1.0.0',
    worker_status: 'running',
    system_info: {
      os: 'linux',
      arch: 'x64',
      platform: 'Ubuntu 24.04',
    },
    ...overrides,
  };
}

describe('ClientService', () => {
  describe('processHeartbeat', () => {
    it('new client returns pending (202) response', async () => {
      const result = await service.processHeartbeat(makeHeartbeat('new-host.example.com'));

      expect(result.status).toBe(202);
      expect(result.body.approved).toBe(false);
      expect(result.body.client_id).toBeDefined();
      expect(result.body.message).toContain('Awaiting');
      expect(result.body.retry_after_seconds).toBeDefined();
    });

    it('new client is auto-registered', async () => {
      await service.processHeartbeat(makeHeartbeat('auto-reg.example.com'));
      const client = await adminStorage.getClientByHostname('auto-reg.example.com');
      expect(client).not.toBeNull();
      expect(client!.status).toBe('pending');
    });

    it('approved client returns full config (200) response', async () => {
      // Register and approve
      const reg = await adminStorage.registerClient({ hostname: 'approved-host.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'approved', 'admin');

      const result = await service.processHeartbeat(makeHeartbeat('approved-host.example.com'));

      expect(result.status).toBe(200);
      expect(result.body.approved).toBe(true);
      expect(result.body.config).toBeDefined();
      expect(result.body.config!.scan_enabled).toBe(true);
    });

    it('rejected client returns 403 response', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'rejected-host.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'rejected', 'admin');

      const result = await service.processHeartbeat(makeHeartbeat('rejected-host.example.com'));

      expect(result.status).toBe(403);
      expect(result.body.approved).toBe(false);
      expect(result.body.message).toContain('denied');
    });

    it('suspended client returns 403 response', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'suspended-host.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'suspended', 'admin');

      const result = await service.processHeartbeat(makeHeartbeat('suspended-host.example.com'));

      expect(result.status).toBe(403);
      expect(result.body.approved).toBe(false);
    });

    it('heartbeat updates client last_seen', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'seen-host.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'approved', 'admin');

      const before = new Date().toISOString();
      await service.processHeartbeat(makeHeartbeat('seen-host.example.com'));

      const client = await adminStorage.getClientByHostname('seen-host.example.com');
      expect(new Date(client!.last_seen!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
    });

    it('heartbeat from same hostname returns same client_id', async () => {
      const result1 = await service.processHeartbeat(makeHeartbeat('idempotent.example.com'));
      const result2 = await service.processHeartbeat(makeHeartbeat('idempotent.example.com'));
      expect(result1.body.client_id).toBe(result2.body.client_id);
    });
  });

  describe('processIngest', () => {
    it('returns 401 for unknown client', async () => {
      const request: IngestRequest = {
        clientHostname: 'unknown.example.com',
        records: [{ timestamp: '2025-01-15T10:00:00Z', service: 'openai', model: 'gpt-4' }],
      };

      const result = await service.processIngest(request);
      expect(result.status).toBe(401);
    });

    it('returns 403 for non-approved client', async () => {
      await adminStorage.registerClient({ hostname: 'pending.example.com' });

      const request: IngestRequest = {
        clientHostname: 'pending.example.com',
        records: [{ timestamp: '2025-01-15T10:00:00Z', service: 'openai', model: 'gpt-4' }],
      };

      const result = await service.processIngest(request);
      expect(result.status).toBe(403);
    });

    it('approved client can ingest records', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'ingest.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'approved', 'admin');

      const request: IngestRequest = {
        clientHostname: 'ingest.example.com',
        records: [
          { timestamp: '2025-01-15T10:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.05 },
          { timestamp: '2025-01-15T11:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.10 },
        ],
      };

      const result = await service.processIngest(request);
      expect(result.status).toBe(200);
      expect('ingestion_id' in result.body).toBe(true);
      const body = result.body as { records_processed: number; records_valid: number; status: string };
      expect(body.records_processed).toBe(2);
      expect(body.records_valid).toBe(2);
      expect(body.status).toBe('accepted');
    });

    it('ingest updates client stats', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'stats-test.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'approved', 'admin');

      const request: IngestRequest = {
        clientHostname: 'stats-test.example.com',
        records: [
          { timestamp: '2025-01-15T10:00:00Z', service: 'openai', model: 'gpt-4' },
        ],
      };

      await service.processIngest(request);
      const client = await adminStorage.getClient(reg.client_id);
      expect(client!.stats.total_uploads).toBe(1);
      expect(client!.stats.total_records).toBe(1);
      expect(client!.stats.last_upload).not.toBeNull();
    });

    it('ingest stores records in token storage', async () => {
      const reg = await adminStorage.registerClient({ hostname: 'store-test.example.com' });
      await adminStorage.setClientStatus(reg.client_id, 'approved', 'admin');

      await service.processIngest({
        clientHostname: 'store-test.example.com',
        records: [
          { timestamp: '2025-01-15T10:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.05 },
        ],
      });

      const query = await tokenStorage.queryUsage({ client_ids: [reg.client_id] });
      expect(query.total_records).toBe(1);
    });
  });
});
