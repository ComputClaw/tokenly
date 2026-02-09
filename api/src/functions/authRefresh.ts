import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, handleError, handleOptions, corsHeaders, parseCookies } from './_helpers.js';

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const services = await ensureInitialized();
    const cookies = parseCookies(request);
    const refreshToken = cookies['refresh_token'];

    if (!refreshToken) {
      return errorResponse(401, 'missing_token', 'No refresh token provided');
    }

    const decoded = services.jwtValidationService.verifyRefreshToken(refreshToken);
    if (!decoded) {
      return errorResponse(401, 'invalid_token', 'Invalid or expired refresh token');
    }

    const stored = services.refreshTokenStore.get(refreshToken);
    if (!stored) {
      return errorResponse(401, 'invalid_token', 'Refresh token has been revoked or expired');
    }

    const user = await services.adminStorage.getAdminUser(decoded.username);
    if (!user || !user.enabled) {
      return errorResponse(401, 'user_disabled', 'User account is disabled');
    }

    const jwtPayload = {
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      sub: user.user_id as string,
    };

    const accessToken = services.jwtTokenService.createAccessToken(jwtPayload);

    return new HttpResponse({
      status: 200,
      jsonBody: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: services.jwtTokenService.getAccessTokenExpirationSeconds(),
      },
      headers: corsHeaders(),
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('authRefresh', {
  methods: ['POST', 'OPTIONS'],
  route: 'auth/refresh',
  authLevel: 'anonymous',
  handler,
});
