import * as jwt from 'jsonwebtoken';
import { JwtTokenService } from './JwtTokenService';
import type { JwtPayload } from './JwtTokenService';

// Set env vars before constructing the service
const TEST_SECRET = 'test-secret-key-for-unit-tests';
process.env.TOKENLY_JWT_SECRET = TEST_SECRET;
process.env.TOKENLY_JWT_EXPIRATION_MINUTES = '15';
process.env.TOKENLY_REFRESH_TOKEN_EXPIRATION_DAYS = '7';
process.env.TOKENLY_JWT_ISSUER = 'tokenly-server';
process.env.TOKENLY_JWT_AUDIENCE = 'tokenly-admin';

const service = new JwtTokenService();

const testPayload: JwtPayload = {
  username: 'admin',
  role: 'super_admin',
  permissions: ['client:approve', 'config:read'],
  sub: 'user-id-123',
};

describe('JwtTokenService', () => {
  describe('createAccessToken', () => {
    it('creates a valid JWT access token', () => {
      const token = service.createAccessToken(testPayload);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('token contains correct claims', () => {
      const token = service.createAccessToken(testPayload);
      const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;

      expect(decoded.username).toBe('admin');
      expect(decoded.role).toBe('super_admin');
      expect(decoded.permissions).toEqual(['client:approve', 'config:read']);
      expect(decoded.sub).toBe('user-id-123');
    });

    it('token has correct issuer and audience', () => {
      const token = service.createAccessToken(testPayload);
      const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;

      expect(decoded.iss).toBe('tokenly-server');
      expect(decoded.aud).toBe('tokenly-admin');
    });

    it('access token expiration is set correctly', () => {
      const token = service.createAccessToken(testPayload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      const expectedExpiry = decoded.iat! + 15 * 60; // 15 minutes in seconds
      expect(decoded.exp).toBe(expectedExpiry);
    });
  });

  describe('createRefreshToken', () => {
    it('creates a valid JWT refresh token', () => {
      const token = service.createRefreshToken(testPayload);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('refresh token contains type=refresh', () => {
      const token = service.createRefreshToken(testPayload);
      const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;

      expect(decoded.type).toBe('refresh');
      expect(decoded.username).toBe('admin');
    });

    it('refresh token expiration is set correctly', () => {
      const token = service.createRefreshToken(testPayload);
      const decoded = jwt.decode(token) as jwt.JwtPayload;

      const expectedExpiry = decoded.iat! + 7 * 24 * 60 * 60; // 7 days in seconds
      expect(decoded.exp).toBe(expectedExpiry);
    });
  });

  describe('createTokenPair', () => {
    it('creates both access and refresh tokens', () => {
      const pair = service.createTokenPair(testPayload);
      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.expiresIn).toBe(15 * 60); // 15 minutes in seconds
    });

    it('access and refresh tokens are different', () => {
      const pair = service.createTokenPair(testPayload);
      expect(pair.accessToken).not.toBe(pair.refreshToken);
    });
  });

  describe('expiration getters', () => {
    it('getAccessTokenExpirationSeconds returns correct value', () => {
      expect(service.getAccessTokenExpirationSeconds()).toBe(15 * 60);
    });

    it('getRefreshExpirationSeconds returns correct value', () => {
      expect(service.getRefreshExpirationSeconds()).toBe(7 * 24 * 60 * 60);
    });
  });
});
