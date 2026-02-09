import * as jwt from 'jsonwebtoken';

export interface VerifiedToken {
  username: string;
  role: string;
  permissions: string[];
  sub: string;
  type?: string;
}

export class JwtValidationService {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    if (!process.env.TOKENLY_JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('TOKENLY_JWT_SECRET must be set in production');
      }
      console.warn('[JwtValidationService] WARNING: TOKENLY_JWT_SECRET is not set. Using insecure default. Set this variable before deploying to production.');
    }
    this.secret = process.env.TOKENLY_JWT_SECRET ?? 'dev-secret-change-in-production';
    this.issuer = process.env.TOKENLY_JWT_ISSUER ?? 'tokenly-server';
    this.audience = process.env.TOKENLY_JWT_AUDIENCE ?? 'tokenly-admin';
  }

  verifyAccessToken(token: string): VerifiedToken | null {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as jwt.JwtPayload;

      return {
        username: decoded.username as string,
        role: decoded.role as string,
        permissions: (decoded.permissions as string[]) ?? [],
        sub: decoded.sub ?? '',
      };
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): VerifiedToken | null {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as jwt.JwtPayload;

      if (decoded.type !== 'refresh') {
        return null;
      }

      return {
        username: decoded.username as string,
        role: '',
        permissions: [],
        sub: decoded.sub ?? '',
        type: 'refresh',
      };
    } catch {
      return null;
    }
  }
}
