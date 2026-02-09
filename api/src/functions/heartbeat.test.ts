import { HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { InMemoryAdminStorage } from '../plugins/InMemoryAdminStorage';
import { InMemoryTokenStorage } from '../plugins/InMemoryTokenStorage';
import { ClientService, HeartbeatRequest } from '../services/ClientService';

// Capture the handler registered via app.http
let capturedHandler: ((request: HttpRequest, context: InvocationContext) => Promise<HttpResponse>) | null = null;

jest.mock('@azure/functions', () => {
  const actual = jest.requireActual('@azure/functions');
  return {
    ...actual,
    app: {
      http: (_name: string, options: { handler: any }) => {
        capturedHandler = options.handler;
      },
    },
  };
});

jest.mock('./_init', () => ({
  ensureInitialized: jest.fn(),
}));

// Import _init AFTER the mock is set up, then import heartbeat to trigger registration
import { ensureInitialized } from './_init';
const mockedInit = ensureInitialized as jest.MockedFunction<typeof ensureInitialized>;

// This import triggers app.http() which captures the handler
import './heartbeat';

let adminStorage: InMemoryAdminStorage;
let tokenStorage: InMemoryTokenStorage;
let clientService: ClientService;

beforeEach(async () => {
  adminStorage = new InMemoryAdminStorage();
  await adminStorage.initialize({});
  tokenStorage = new InMemoryTokenStorage();
  await tokenStorage.initialize({});
  clientService = new ClientService(adminStorage, tokenStorage);

  mockedInit.mockResolvedValue({
    adminStorage,
    tokenStorage,
    clientService,
    adminService: {} as any,
    jwtTokenService: {} as any,
    jwtValidationService: {} as any,
    refreshTokenStore: {} as any,
  });
});

afterEach(async () => {
  await adminStorage.close();
  await tokenStorage.close();
});

function makeHeartbeat(overrides: Partial<HeartbeatRequest> = {}): HeartbeatRequest {
  return {
    client_hostname: 'test-host.example.com',
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

async function invokeHandler(body: unknown): Promise<HttpResponse> {
  if (!capturedHandler) {
    throw new Error('Handler was not captured - heartbeat module did not register');
  }
  const request = new HttpRequest({
    method: 'POST',
    url: 'http://localhost/api/heartbeat',
    body: { string: JSON.stringify(body) },
    headers: { 'Content-Type': 'application/json' },
  });
  const context = new InvocationContext({ functionName: 'heartbeat' });
  return capturedHandler(request, context);
}

describe('heartbeat handler validation', () => {
  it('valid full request returns 200 or 202', async () => {
    const response = await invokeHandler(makeHeartbeat());
    expect([200, 202]).toContain(response.status);
  });

  it('missing client_hostname returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).client_hostname;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('missing timestamp returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).timestamp;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('missing launcher_version returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).launcher_version;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('missing worker_version returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).worker_version;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('missing worker_status returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).worker_status;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('invalid worker_status returns 400', async () => {
    const response = await invokeHandler(makeHeartbeat({ worker_status: 'updating' }));
    expect(response.status).toBe(400);

    const response2 = await invokeHandler(makeHeartbeat({ worker_status: 'idle' }));
    expect(response2.status).toBe(400);
  });

  it.each(['running', 'pending', 'stopped', 'crashed'])(
    'valid worker_status "%s" does not return 400',
    async (status) => {
      const response = await invokeHandler(makeHeartbeat({ worker_status: status }));
      expect(response.status).not.toBe(400);
    },
  );

  it('missing system_info returns 400', async () => {
    const body = makeHeartbeat();
    delete (body as any).system_info;
    const response = await invokeHandler(body);
    expect(response.status).toBe(400);
  });

  it('invalid system_info.os returns 400', async () => {
    const response = await invokeHandler(
      makeHeartbeat({ system_info: { os: 'freebsd', arch: 'x64', platform: 'test' } }),
    );
    expect(response.status).toBe(400);
  });

  it('invalid system_info.arch returns 400', async () => {
    const response = await invokeHandler(
      makeHeartbeat({ system_info: { os: 'linux', arch: 'x86', platform: 'test' } }),
    );
    expect(response.status).toBe(400);
  });

  it.each(['linux', 'windows', 'darwin'])(
    'valid system_info.os "%s" does not return 400',
    async (os) => {
      const response = await invokeHandler(
        makeHeartbeat({ system_info: { os, arch: 'x64', platform: 'test' } }),
      );
      expect(response.status).not.toBe(400);
    },
  );

  it.each(['x64', 'arm64'])(
    'valid system_info.arch "%s" does not return 400',
    async (arch) => {
      const response = await invokeHandler(
        makeHeartbeat({ system_info: { os: 'linux', arch, platform: 'test' } }),
      );
      expect(response.status).not.toBe(400);
    },
  );

  it('optional stats field can be omitted and still succeeds', async () => {
    const body = makeHeartbeat();
    delete body.stats;
    const response = await invokeHandler(body);
    expect([200, 202]).toContain(response.status);
  });

  it('optional system_info.platform can be omitted and still succeeds', async () => {
    const { platform, ...rest } = makeHeartbeat().system_info;
    const body = makeHeartbeat({ system_info: rest as any });
    const response = await invokeHandler(body);
    expect([200, 202]).toContain(response.status);
  });
});
