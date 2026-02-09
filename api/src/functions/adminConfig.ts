import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest, requirePermission, getClientIp, parseJsonBody } from './_helpers.js';

interface SetConfigBody {
  value?: unknown;
}

async function listConfigHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'config:read')) {
      return errorResponse(403, 'forbidden', 'Missing permission: config:read');
    }

    const services = await ensureInitialized();
    const prefix = request.query.get('prefix') ?? '';
    const configs = await services.adminService.listConfig(prefix);

    return jsonResponse(200, {
      configs,
      total: configs.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function getConfigHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'config:read')) {
      return errorResponse(403, 'forbidden', 'Missing permission: config:read');
    }

    const services = await ensureInitialized();
    const key = request.params.key;
    if (!key) {
      return errorResponse(400, 'validation_failed', 'key parameter required');
    }

    const config = await services.adminService.getConfig(key);
    if (!config) {
      return errorResponse(404, 'not_found', `Config key not found: ${key}`);
    }

    return jsonResponse(200, config);
  } catch (err) {
    return handleError(err);
  }
}

async function setConfigHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'config:write')) {
      return errorResponse(403, 'forbidden', 'Missing permission: config:write');
    }

    const services = await ensureInitialized();
    const key = request.params.key;
    if (!key) {
      return errorResponse(400, 'validation_failed', 'key parameter required');
    }

    const body = await parseJsonBody<SetConfigBody>(request);
    if (!body || body.value === undefined) {
      return errorResponse(400, 'validation_failed', 'value is required');
    }

    await services.adminService.setConfig(key, body.value, user.username, getClientIp(request));

    const updated = await services.adminService.getConfig(key);
    return jsonResponse(200, updated);
  } catch (err) {
    return handleError(err);
  }
}

app.http('mgmtConfigList', {
  methods: ['GET', 'OPTIONS'],
  route: 'manage/config',
  authLevel: 'anonymous',
  handler: listConfigHandler,
});

async function deleteConfigHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'config:write')) {
      return errorResponse(403, 'forbidden', 'Missing permission: config:write');
    }

    const services = await ensureInitialized();
    const key = request.params.key;
    if (!key) {
      return errorResponse(400, 'validation_failed', 'key parameter required');
    }

    const existing = await services.adminService.getConfig(key);
    if (!existing) {
      return errorResponse(404, 'not_found', `Config key not found: ${key}`);
    }

    await services.adminService.deleteConfig(key, user.username, getClientIp(request));

    return jsonResponse(200, { key, deleted: true });
  } catch (err) {
    return handleError(err);
  }
}

app.http('mgmtConfigKey', {
  methods: ['GET', 'PUT', 'DELETE', 'OPTIONS'],
  route: 'manage/config/{key}',
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    if (request.method === 'GET') return getConfigHandler(request, context);
    if (request.method === 'PUT') return setConfigHandler(request, context);
    if (request.method === 'DELETE') return deleteConfigHandler(request, context);
    return handleOptions();
  },
});
