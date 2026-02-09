import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, handleError, handleOptions, getClientIp, corsHeaders, parseJsonBody, isNonEmptyString } from './_helpers.js';

interface LoginBody {
  username?: string;
  password?: string;
}

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const services = await ensureInitialized();
    const body = await parseJsonBody<LoginBody>(request);

    if (!body || !isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
      return errorResponse(400, 'validation_failed', 'Username and password are required');
    }

    const user = await services.adminService.validatePassword(body.username, body.password);
    if (!user) {
      await services.adminService.logAction(
        'admin_login_failed', 'user', body.username,
        undefined, { username: body.username },
        getClientIp(request), request.headers.get('user-agent') ?? undefined,
      );
      return errorResponse(401, 'invalid_credentials', 'Invalid username or password');
    }

    const jwtPayload = {
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      sub: user.user_id as string,
    };

    const tokenPair = services.jwtTokenService.createTokenPair(jwtPayload);

    services.refreshTokenStore.store(
      tokenPair.refreshToken,
      user.username,
      user.user_id as string,
      services.jwtTokenService.getRefreshExpirationSeconds(),
    );

    await services.adminService.logAction(
      'admin_login', 'user', user.username,
      user.user_id as string, {},
      getClientIp(request), request.headers.get('user-agent') ?? undefined,
    );

    await services.adminStorage.updateAdminUser(user.username, {
      last_login: new Date().toISOString(),
      updated_by: user.username,
    });

    const maxAge = services.jwtTokenService.getRefreshExpirationSeconds();

    return new HttpResponse({
      status: 200,
      jsonBody: {
        access_token: tokenPair.accessToken,
        token_type: 'Bearer',
        expires_in: tokenPair.expiresIn,
        user: {
          username: user.username,
          permissions: user.permissions,
        },
      },
      headers: {
        ...corsHeaders(),
        'Set-Cookie': `refresh_token=${tokenPair.refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('authLogin', {
  methods: ['POST', 'OPTIONS'],
  route: 'v1/auth/login',
  authLevel: 'anonymous',
  handler,
});
