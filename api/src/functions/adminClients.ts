import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest, requirePermission, getClientIp, parseJsonBody } from './_helpers.js';
import { ClientStatus } from '../models/index.js';

interface ClientActionBody {
  notes?: string;
}

async function listClientsHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();

    const statusParam = request.query.get('status');
    const hostname = request.query.get('hostname') ?? undefined;
    const limit = parseInt(request.query.get('limit') ?? '100', 10);
    const offset = parseInt(request.query.get('offset') ?? '0', 10);

    const statusFilter = statusParam
      ? statusParam.split(',') as ClientStatus[]
      : undefined;

    const result = await services.adminService.listClients({
      status: statusFilter,
      hostname,
      limit,
      offset,
    });

    const summary = await services.adminService.getClientSummary();

    return jsonResponse(200, {
      clients: result.clients,
      total: result.total,
      summary,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function approveClientHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'client:approve')) {
      return errorResponse(403, 'forbidden', 'Missing permission: client:approve');
    }

    const services = await ensureInitialized();
    const clientId = request.params.clientId;
    if (!clientId) {
      return errorResponse(400, 'validation_failed', 'clientId parameter required');
    }

    const client = await services.adminService.getClient(clientId);
    if (!client) {
      return errorResponse(404, 'not_found', 'Client not found');
    }

    const body = await parseJsonBody<ClientActionBody>(request) ?? {};

    await services.adminService.approveClient(clientId, user.username, body.notes, getClientIp(request));

    return jsonResponse(200, {
      client_id: clientId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.username,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function rejectClientHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'client:reject')) {
      return errorResponse(403, 'forbidden', 'Missing permission: client:reject');
    }

    const services = await ensureInitialized();
    const clientId = request.params.clientId;
    if (!clientId) {
      return errorResponse(400, 'validation_failed', 'clientId parameter required');
    }

    const client = await services.adminService.getClient(clientId);
    if (!client) {
      return errorResponse(404, 'not_found', 'Client not found');
    }

    const body = await parseJsonBody<ClientActionBody>(request) ?? {};

    await services.adminService.rejectClient(clientId, user.username, body.notes, getClientIp(request));

    return jsonResponse(200, {
      client_id: clientId,
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: user.username,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function deleteClientHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'client:delete')) {
      return errorResponse(403, 'forbidden', 'Missing permission: client:delete');
    }

    const services = await ensureInitialized();
    const clientId = request.params.clientId;
    if (!clientId) {
      return errorResponse(400, 'validation_failed', 'clientId parameter required');
    }

    const client = await services.adminService.getClient(clientId);
    if (!client) {
      return errorResponse(404, 'not_found', 'Client not found');
    }

    await services.adminService.deleteClient(clientId, user.username, getClientIp(request));

    return jsonResponse(200, {
      client_id: clientId,
      status: 'deleted',
      deleted_at: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('adminClientsList', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/clients',
  authLevel: 'anonymous',
  handler: listClientsHandler,
});

app.http('adminClientApprove', {
  methods: ['PUT', 'OPTIONS'],
  route: 'v1/admin/clients/{clientId}/approve',
  authLevel: 'anonymous',
  handler: approveClientHandler,
});

app.http('adminClientReject', {
  methods: ['PUT', 'OPTIONS'],
  route: 'v1/admin/clients/{clientId}/reject',
  authLevel: 'anonymous',
  handler: rejectClientHandler,
});

app.http('adminClientDelete', {
  methods: ['DELETE', 'OPTIONS'],
  route: 'v1/admin/clients/{clientId}',
  authLevel: 'anonymous',
  handler: deleteClientHandler,
});
