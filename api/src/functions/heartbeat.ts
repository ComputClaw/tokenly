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

    if (!isNonEmptyString(body.timestamp)) {
      return errorResponse(400, 'validation_failed', 'timestamp is required');
    }

    if (!isNonEmptyString(body.launcher_version)) {
      return errorResponse(400, 'validation_failed', 'launcher_version is required');
    }

    if (!isNonEmptyString(body.worker_version)) {
      return errorResponse(400, 'validation_failed', 'worker_version is required');
    }

    const validWorkerStatuses = ['running', 'pending', 'stopped', 'crashed'];
    if (!body.worker_status || !validWorkerStatuses.includes(body.worker_status)) {
      return errorResponse(400, 'validation_failed', 'worker_status must be one of: running, pending, stopped, crashed');
    }

    if (!body.system_info || typeof body.system_info !== 'object') {
      return errorResponse(400, 'validation_failed', 'system_info is required');
    }

    const validOs = ['linux', 'windows', 'darwin'];
    if (!body.system_info.os || !validOs.includes(body.system_info.os)) {
      return errorResponse(400, 'validation_failed', 'system_info.os must be one of: linux, windows, darwin');
    }

    const validArch = ['x64', 'arm64'];
    if (!body.system_info.arch || !validArch.includes(body.system_info.arch)) {
      return errorResponse(400, 'validation_failed', 'system_info.arch must be one of: x64, arm64');
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
  route: 'heartbeat',
  authLevel: 'anonymous',
  handler,
});
