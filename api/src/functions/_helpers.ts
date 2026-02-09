import { HttpRequest, HttpResponse } from '@azure/functions';
import { v4 as uuidv4 } from 'uuid';
import { ensureInitialized } from './_init.js';
import { VerifiedToken } from '../services/JwtValidationService.js';
import { Permission } from '../models/index.js';
import { isAppError } from '../models/result.js';

export function errorResponse(status: number, error: string, message: string, details?: Record<string, unknown>): HttpResponse {
  return new HttpResponse({
    status,
    jsonBody: {
      error,
      message,
      details: details ?? {},
      timestamp: new Date().toISOString(),
      request_id: uuidv4(),
    },
    headers: corsHeaders(),
  });
}

export function jsonResponse(status: number, body: unknown): HttpResponse {
  return new HttpResponse({
    status,
    jsonBody: body,
    headers: corsHeaders(),
  });
}

export function handleError(err: unknown): HttpResponse {
  if (isAppError(err)) {
    return errorResponse(err.statusCode, err.code.toLowerCase(), err.message);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (message.includes('not found')) {
    return errorResponse(404, 'not_found', message);
  }
  if (message.includes('already exists')) {
    return errorResponse(409, 'conflict', message);
  }
  return errorResponse(500, 'internal_error', message);
}

export function corsHeaders(): Record<string, string> {
  const origin = process.env.TOKENLY_CORS_ORIGINS ?? 'http://localhost:4280';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  // Only include credentials header when origin is not wildcard (browsers reject this combination)
  if (origin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function handleOptions(): HttpResponse {
  return new HttpResponse({ status: 204, headers: corsHeaders() });
}

export async function authenticateRequest(request: HttpRequest): Promise<VerifiedToken | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const services = await ensureInitialized();
  return services.jwtValidationService.verifyAccessToken(token);
}

export function requirePermission(user: VerifiedToken, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export async function parseJsonBody<T>(request: HttpRequest): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseCookies(request: HttpRequest): Record<string, string> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) {
      cookies[name.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}

export function getClientIp(request: HttpRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? '';
}
