import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest, requirePermission } from './_helpers.js';
import { AuditActionType, AuditResourceType } from '../models/index.js';

async function handler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'audit:read')) {
      return errorResponse(403, 'forbidden', 'Missing permission: audit:read');
    }

    const services = await ensureInitialized();

    const userId = request.query.get('user_id') ?? undefined;
    const actionsParam = request.query.get('actions');
    const resourcesParam = request.query.get('resources');
    const resourceId = request.query.get('resource_id') ?? undefined;
    const timestampAfter = request.query.get('timestamp_after') ?? undefined;
    const timestampBefore = request.query.get('timestamp_before') ?? undefined;
    const limit = parseInt(request.query.get('limit') ?? '100', 10);
    const offset = parseInt(request.query.get('offset') ?? '0', 10);

    const actions = actionsParam
      ? actionsParam.split(',') as AuditActionType[]
      : undefined;
    const resources = resourcesParam
      ? resourcesParam.split(',') as AuditResourceType[]
      : undefined;

    const result = await services.adminService.getAuditLog({
      user_id: userId,
      actions,
      resources,
      resource_id: resourceId,
      timestamp_after: timestampAfter,
      timestamp_before: timestampBefore,
      limit,
      offset,
    });

    return jsonResponse(200, {
      entries: result.entries,
      total: result.total,
      limit,
      offset,
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('mgmtAudit', {
  methods: ['GET', 'OPTIONS'],
  route: 'manage/audit',
  authLevel: 'anonymous',
  handler,
});
