import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosHeaders } from 'axios';

// We need to test the module's exported functions and interceptor behavior.
// We'll mock axios.create() to return a controllable fake instance.

interface FakeConfig {
  headers: Record<string, string> & { Authorization?: string };
}

let requestInterceptorFn: (config: FakeConfig) => FakeConfig;
let responseSuccessFn: (response: unknown) => unknown;
let responseErrorFn: (error: unknown) => Promise<unknown>;

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

// The instance itself needs to be callable for retry logic
const mockInstance = vi.fn();
Object.assign(mockInstance, {
  interceptors: {
    request: {
      use: vi.fn((fn: (config: FakeConfig) => FakeConfig) => {
        requestInterceptorFn = fn;
      }),
    },
    response: {
      use: vi.fn((success: (r: unknown) => unknown, error: (e: unknown) => Promise<unknown>) => {
        responseSuccessFn = success;
        responseErrorFn = error;
      }),
    },
  },
  get: mockGet,
  post: mockPost,
  put: mockPut,
  delete: mockDelete,
  defaults: { headers: { common: {} } },
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockInstance),
  },
}));

vi.mock('../types/schemas.ts', () => ({
  LoginResponseSchema: { parse: (d: unknown) => d },
  ClientListResponseSchema: { parse: (d: unknown) => d },
  SystemStatusSchema: { parse: (d: unknown) => d },
}));

describe('API Client', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-register mock so fresh import captures interceptors
    vi.doMock('axios', () => ({
      default: {
        create: vi.fn(() => mockInstance),
      },
    }));
    vi.doMock('../types/schemas.ts', () => ({
      LoginResponseSchema: { parse: (d: unknown) => d },
      ClientListResponseSchema: { parse: (d: unknown) => d },
      SystemStatusSchema: { parse: (d: unknown) => d },
    }));
  });

  it('sets Authorization header with token', async () => {
    const mod = await import('./api-client.ts');
    mod.setAccessToken('my-token');

    const config: FakeConfig = { headers: {} };
    const result = requestInterceptorFn(config);
    expect(result.headers.Authorization).toBe('Bearer my-token');
  });

  it('does not set Authorization header when no token', async () => {
    const mod = await import('./api-client.ts');
    mod.setAccessToken(null);

    const config: FakeConfig = { headers: {} };
    const result = requestInterceptorFn(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('401 response triggers refresh and retry', async () => {
    const mod = await import('./api-client.ts');
    mod.setAccessToken('expired');

    const originalConfig: FakeConfig = { headers: {} };

    // Mock refresh success
    mockPost.mockResolvedValueOnce({
      data: { access_token: 'new-token', token_type: 'bearer', expires_in: 3600 },
    });

    // Mock the retry call (mockInstance is callable)
    mockInstance.mockResolvedValueOnce({ data: { ok: true } });

    const error = {
      response: { status: 401 },
      config: originalConfig,
    };

    const result = await responseErrorFn(error);
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh');
    expect(originalConfig.headers.Authorization).toBe('Bearer new-token');
  });

  it('failed refresh redirects to login', async () => {
    const mod = await import('./api-client.ts');
    mod.setAccessToken('expired');

    const originalConfig: FakeConfig = { headers: {} };

    // Mock refresh failure
    mockPost.mockRejectedValueOnce(new Error('Refresh failed'));

    // Save and mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });

    const error = {
      response: { status: 401 },
      config: originalConfig,
    };

    await expect(responseErrorFn(error)).rejects.toBeDefined();
    expect(window.location.href).toBe('/login');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
