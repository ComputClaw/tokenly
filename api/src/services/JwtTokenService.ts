import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  username: string;
  role: string;
  permissions: string[];
  sub: string; // user_id
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class JwtTokenService {
  private readonly secret: string;
  private readonly accessExpirationMinutes: number;
  private readonly refreshExpirationDays: number;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    if (!process.env.TOKENLY_JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('TOKENLY_JWT_SECRET must be set in production');
      }
      console.warn('[JwtTokenService] WARNING: TOKENLY_JWT_SECRET is not set. Using insecure default. Set this variable before deploying to production.');
    }
    this.secret = process.env.TOKENLY_JWT_SECRET ?? 'dev-secret-change-in-production';
    this.accessExpirationMinutes = parseInt(process.env.TOKENLY_JWT_EXPIRATION_MINUTES ?? '15', 10);
    this.refreshExpirationDays = parseInt(process.env.TOKENLY_REFRESH_TOKEN_EXPIRATION_DAYS ?? '7', 10);
    this.issuer = process.env.TOKENLY_JWT_ISSUER ?? 'tokenly-server';
    this.audience = process.env.TOKENLY_JWT_AUDIENCE ?? 'tokenly-admin';
  }

  createAccessToken(payload: JwtPayload): string {
    return jwt.sign(
      { username: payload.username, role: payload.role, permissions: payload.permissions },
      this.secret,
      {
        subject: payload.sub,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: `${this.accessExpirationMinutes}m`,
      }
    );
  }

  createRefreshToken(payload: JwtPayload): string {
    return jwt.sign(
      { username: payload.username, type: 'refresh' },
      this.secret,
      {
        subject: payload.sub,
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: `${this.refreshExpirationDays}d`,
      }
    );
  }

  createTokenPair(payload: JwtPayload): TokenPair {
    return {
      accessToken: this.createAccessToken(payload),
      refreshToken: this.createRefreshToken(payload),
      expiresIn: this.accessExpirationMinutes * 60,
    };
  }

  getAccessTokenExpirationSeconds(): number {
    return this.accessExpirationMinutes * 60;
  }

  getRefreshExpirationSeconds(): number {
    return this.refreshExpirationDays * 24 * 60 * 60;
  }
}
