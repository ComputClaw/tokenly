import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest } from './_helpers.js';

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();
    const stats = await services.adminService.getSystemStats();

    return jsonResponse(200, {
      server: {
        version: stats.version,
        uptime_seconds: stats.uptime_seconds,
        memory_usage_mb: stats.memory_usage_mb,
        cpu_usage_percent: stats.cpu_usage_percent,
      },
      storage: stats.storage,
      clients: stats.clients,
      ingestion: stats.ingestion,
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('adminStatus', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/status',
  authLevel: 'anonymous',
  handler,
});
