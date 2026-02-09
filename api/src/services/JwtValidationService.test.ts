import * as jwt from 'jsonwebtoken';
import { JwtValidationService } from './JwtValidationService';

const TEST_SECRET = 'test-secret-key-for-unit-tests';
process.env.TOKENLY_JWT_SECRET = TEST_SECRET;
process.env.TOKENLY_JWT_ISSUER = 'tokenly-server';
process.env.TOKENLY_JWT_AUDIENCE = 'tokenly-admin';

const service = new JwtValidationService();

function makeAccessToken(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    {
      username: 'admin',
      role: 'super_admin',
      permissions: ['client:approve', 'config:read'],
      ...overrides,
    },
    TEST_SECRET,
    {
      subject: 'user-id-123',
      issuer: 'tokenly-server',
      audience: 'tokenly-admin',
      expiresIn: '15m',
      ...options,
    }
  );
}

function makeRefreshToken(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    {
      username: 'admin',
      type: 'refresh',
      ...overrides,
    },
    TEST_SECRET,
    {
      subject: 'user-id-123',
      issuer: 'tokenly-server',
      audience: 'tokenly-admin',
      expiresIn: '7d',
      ...options,
    }
  );
}

describe('JwtValidationService', () => {
  describe('verifyAccessToken', () => {
    it('validates a good access token', () => {
      const token = makeAccessToken();
      const result = service.verifyAccessToken(token);

      expect(result).not.toBeNull();
      expect(result!.username).toBe('admin');
      expect(result!.role).toBe('super_admin');
      expect(result!.permissions).toEqual(['client:approve', 'config:read']);
      expect(result!.sub).toBe('user-id-123');
    });

    it('rejects expired token', () => {
      const token = makeAccessToken({}, { expiresIn: '0s' });
      // Need a small delay to ensure expiry
      const result = service.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    it('rejects token with wrong secret', () => {
      const token = jwt.sign(
        { username: 'admin', role: 'super_admin', permissions: [] },
        'wrong-secret',
        { subject: 'user-id-123', issuer: 'tokenly-server', audience: 'tokenly-admin', expiresIn: '15m' }
      );
      const result = service.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    it('rejects completely invalid token', () => {
      const result = service.verifyAccessToken('not-a-jwt');
      expect(result).toBeNull();
    });

    it('rejects token with wrong issuer', () => {
      const token = makeAccessToken({}, { issuer: 'wrong-issuer' });
      const result = service.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    it('rejects token with wrong audience', () => {
      const token = makeAccessToken({}, { audience: 'wrong-audience' });
      const result = service.verifyAccessToken(token);
      expect(result).toBeNull();
    });

    it('extracts claims correctly', () => {
      const token = makeAccessToken({
        username: 'viewer1',
        role: 'viewer',
        permissions: ['config:read'],
      }, { subject: 'user-456' });

      const result = service.verifyAccessToken(token);
      expect(result).not.toBeNull();
      expect(result!.username).toBe('viewer1');
      expect(result!.role).toBe('viewer');
      expect(result!.permissions).toEqual(['config:read']);
      expect(result!.sub).toBe('user-456');
    });
  });

  describe('verifyRefreshToken', () => {
    it('validates a good refresh token', () => {
      const token = makeRefreshToken();
      const result = service.verifyRefreshToken(token);

      expect(result).not.toBeNull();
      expect(result!.username).toBe('admin');
      expect(result!.type).toBe('refresh');
      expect(result!.sub).toBe('user-id-123');
    });

    it('rejects refresh token without type=refresh', () => {
      // An access token (no type: refresh) should be rejected by verifyRefreshToken
      const token = makeAccessToken();
      const result = service.verifyRefreshToken(token);
      expect(result).toBeNull();
    });

    it('rejects expired refresh token', () => {
      const token = makeRefreshToken({}, { expiresIn: '0s' });
      const result = service.verifyRefreshToken(token);
      expect(result).toBeNull();
    });

    it('rejects refresh token with wrong secret', () => {
      const token = jwt.sign(
        { username: 'admin', type: 'refresh' },
        'wrong-secret',
        { subject: 'user-id-123', issuer: 'tokenly-server', audience: 'tokenly-admin', expiresIn: '7d' }
      );
      const result = service.verifyRefreshToken(token);
      expect(result).toBeNull();
    });
  });
});
