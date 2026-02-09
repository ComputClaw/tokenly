export interface StoredRefreshToken {
  token: string;
  username: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

export class RefreshTokenStore {
  private tokens = new Map<string, StoredRefreshToken>();

  store(token: string, username: string, userId: string, expiresInSeconds: number): void {
    const now = new Date();
    this.tokens.set(token, {
      token,
      username,
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
      revoked: false,
    });
  }

  get(token: string): StoredRefreshToken | null {
    const stored = this.tokens.get(token);
    if (!stored) return null;
    if (stored.revoked) return null;
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return stored;
  }

  revoke(token: string): boolean {
    const stored = this.tokens.get(token);
    if (!stored) return false;
    stored.revoked = true;
    return true;
  }

  revokeAllForUser(username: string): number {
    let count = 0;
    for (const stored of this.tokens.values()) {
      if (stored.username === username && !stored.revoked) {
        stored.revoked = true;
        count++;
      }
    }
    return count;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, stored] of this.tokens.entries()) {
      if (stored.revoked || new Date(stored.expiresAt).getTime() < now) {
        this.tokens.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
