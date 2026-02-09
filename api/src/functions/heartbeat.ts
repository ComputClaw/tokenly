import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, handleError, handleOptions, corsHeaders, parseJsonBody, isNonEmptyString } from './_helpers.js';
import { HeartbeatRequest } from '../services/ClientService.js';

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const services = await ensureInitialized();
    const body = await parseJsonBody<HeartbeatRequest>(request);

    if (!body || !isNonEmptyString(body.client_hostname)) {
      return errorResponse(400, 'validation_failed', 'client_hostname is required');
    }

    const result = await services.clientService.processHeartbeat(body);

    return new HttpResponse({
      status: result.status,
      jsonBody: result.body,
      headers: corsHeaders(),
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('heartbeat', {
  methods: ['POST', 'OPTIONS'],
  route: 'v1/heartbeat',
  authLevel: 'anonymous',
  handler,
});
