import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { handleError, handleOptions, corsHeaders, parseCookies, getClientIp, authenticateRequest } from './_helpers.js';

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const services = await ensureInitialized();
    const cookies = parseCookies(request);
    const refreshToken = cookies['refresh_token'];

    if (refreshToken) {
      services.refreshTokenStore.revoke(refreshToken);
    }

    const user = await authenticateRequest(request);
    if (user) {
      await services.adminService.logAction(
        'admin_logout', 'user', user.username,
        user.sub, {},
        getClientIp(request), request.headers.get('user-agent') ?? undefined,
      );
    }

    return new HttpResponse({
      status: 200,
      jsonBody: { message: 'Logged out successfully' },
      headers: {
        ...corsHeaders(),
        'Set-Cookie': 'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('authLogout', {
  methods: ['POST', 'OPTIONS'],
  route: 'v1/auth/logout',
  authLevel: 'anonymous',
  handler,
});
