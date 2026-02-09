import { RefreshTokenStore } from './RefreshTokenStore';

let store: RefreshTokenStore;

beforeEach(() => {
  store = new RefreshTokenStore();
});

describe('RefreshTokenStore', () => {
  describe('store and get', () => {
    it('stores and retrieves a token', () => {
      store.store('token-abc', 'admin', 'user-1', 3600);
      const result = store.get('token-abc');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('token-abc');
      expect(result!.username).toBe('admin');
      expect(result!.userId).toBe('user-1');
      expect(result!.revoked).toBe(false);
    });

    it('returns null for non-existent token', () => {
      const result = store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for expired token', async () => {
      // Store with 0 second expiry then wait a tick for it to expire
      store.store('expired-token', 'admin', 'user-1', 0);
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = store.get('expired-token');
      expect(result).toBeNull();
    });

    it('stored token has correct expiresAt', () => {
      const before = Date.now();
      store.store('token-1', 'admin', 'user-1', 3600);
      const result = store.get('token-1');
      expect(result).not.toBeNull();
      const expiresAt = new Date(result!.expiresAt).getTime();
      // Should expire approximately 3600 seconds from now
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
      expect(expiresAt).toBeLessThanOrEqual(before + 3600 * 1000 + 1000);
    });
  });

  describe('revoke', () => {
    it('revoke token makes it invalid via get', () => {
      store.store('token-to-revoke', 'admin', 'user-1', 3600);
      const revoked = store.revoke('token-to-revoke');
      expect(revoked).toBe(true);

      const result = store.get('token-to-revoke');
      expect(result).toBeNull();
    });

    it('revoke returns false for non-existent token', () => {
      const revoked = store.revoke('nonexistent');
      expect(revoked).toBe(false);
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all tokens for a user', () => {
      store.store('t1', 'admin', 'user-1', 3600);
      store.store('t2', 'admin', 'user-1', 3600);
      store.store('t3', 'other', 'user-2', 3600);

      const count = store.revokeAllForUser('admin');
      expect(count).toBe(2);

      // admin tokens should be gone
      expect(store.get('t1')).toBeNull();
      expect(store.get('t2')).toBeNull();
      // other user token should still be valid
      expect(store.get('t3')).not.toBeNull();
    });

    it('returns 0 if user has no tokens', () => {
      const count = store.revokeAllForUser('nobody');
      expect(count).toBe(0);
    });

    it('does not double-count already revoked tokens', () => {
      store.store('t1', 'admin', 'user-1', 3600);
      store.store('t2', 'admin', 'user-1', 3600);
      store.revoke('t1'); // revoke one first

      const count = store.revokeAllForUser('admin');
      expect(count).toBe(1); // only t2 was still valid
    });
  });

  describe('cleanup', () => {
    it('removes expired and revoked tokens', async () => {
      store.store('expired', 'admin', 'user-1', 0);
      await new Promise(resolve => setTimeout(resolve, 10));
      store.store('revoked-tok', 'admin', 'user-1', 3600);
      store.revoke('revoked-tok');
      store.store('valid', 'admin', 'user-1', 3600);

      const removed = store.cleanup();
      expect(removed).toBe(2);

      // Valid token should remain accessible
      expect(store.get('valid')).not.toBeNull();
    });
  });
});
