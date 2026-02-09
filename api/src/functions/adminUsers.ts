import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import * as bcrypt from 'bcryptjs';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest, requirePermission, getClientIp, parseJsonBody, isNonEmptyString } from './_helpers.js';
import { AdminRole } from '../models/index.js';

interface CreateUserBody {
  username?: string;
  password?: string;
  role?: AdminRole;
}

interface ChangePasswordBody {
  current_password?: string;
  new_password?: string;
}

async function listUsersHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();
    const users = await services.adminService.listUsers();

    const sanitized = users.map(u => ({
      user_id: u.user_id,
      username: u.username,
      role: u.role,
      permissions: u.permissions,
      enabled: u.enabled,
      created_at: u.created_at,
      last_login: u.last_login,
      must_change_password: u.must_change_password,
    }));

    return jsonResponse(200, {
      users: sanitized,
      total: sanitized.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function createUserHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(user, 'user:create')) {
      return errorResponse(403, 'forbidden', 'Missing permission: user:create');
    }

    const services = await ensureInitialized();
    const body = await parseJsonBody<CreateUserBody>(request);

    if (!body || !isNonEmptyString(body.username) || !isNonEmptyString(body.password)) {
      return errorResponse(400, 'validation_failed', 'Username and password are required');
    }

    const role = body.role ?? 'viewer';

    const created = await services.adminService.createUser(
      { username: body.username, password: body.password, role, created_by: user.username },
      user.username,
      getClientIp(request),
    );

    return jsonResponse(201, {
      user_id: created.user_id,
      username: created.username,
      role: created.role,
      enabled: created.enabled,
      created_at: created.created_at,
      must_change_password: true,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function disableUserHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const authUser = await authenticateRequest(request);
    if (!authUser) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(authUser, 'user:edit')) {
      return errorResponse(403, 'forbidden', 'Missing permission: user:edit');
    }

    const services = await ensureInitialized();
    const username = request.params.username;
    if (!username) {
      return errorResponse(400, 'validation_failed', 'username parameter required');
    }

    await services.adminService.disableUser(username, authUser.username, getClientIp(request));

    return jsonResponse(200, {
      username,
      enabled: false,
      disabled_at: new Date().toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}

async function enableUserHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const authUser = await authenticateRequest(request);
    if (!authUser) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }
    if (!requirePermission(authUser, 'user:edit')) {
      return errorResponse(403, 'forbidden', 'Missing permission: user:edit');
    }

    const services = await ensureInitialized();
    const username = request.params.username;
    if (!username) {
      return errorResponse(400, 'validation_failed', 'username parameter required');
    }

    await services.adminService.enableUser(username, authUser.username, getClientIp(request));

    return jsonResponse(200, {
      username,
      enabled: true,
    });
  } catch (err) {
    return handleError(err);
  }
}

async function changePasswordHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const authUser = await authenticateRequest(request);
    if (!authUser) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();
    const username = request.params.username;
    if (!username) {
      return errorResponse(400, 'validation_failed', 'username parameter required');
    }

    if (username !== authUser.username && !requirePermission(authUser, 'user:edit')) {
      return errorResponse(403, 'forbidden', 'Missing permission: user:edit');
    }

    const body = await parseJsonBody<ChangePasswordBody>(request);

    if (!body || !isNonEmptyString(body.new_password)) {
      return errorResponse(400, 'validation_failed', 'new_password is required');
    }

    if (username === authUser.username && !requirePermission(authUser, 'user:edit')) {
      if (!isNonEmptyString(body.current_password)) {
        return errorResponse(400, 'validation_failed', 'current_password is required when changing your own password');
      }
      const valid = await services.adminService.validatePassword(username, body.current_password);
      if (!valid) {
        return errorResponse(401, 'invalid_credentials', 'Current password is incorrect');
      }
    }

    const passwordHash = await bcrypt.hash(body.new_password, 12);
    await services.adminService.changePassword(username, passwordHash, authUser.username, getClientIp(request));

    return jsonResponse(200, {
      username,
      message: 'Password changed successfully',
    });
  } catch (err) {
    return handleError(err);
  }
}

app.http('mgmtUsers', {
  methods: ['GET', 'POST', 'OPTIONS'],
  route: 'manage/users',
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponse> => {
    if (request.method === 'GET') return listUsersHandler(request, context);
    if (request.method === 'POST') return createUserHandler(request, context);
    return handleOptions();
  },
});

app.http('mgmtUserDisable', {
  methods: ['PUT', 'OPTIONS'],
  route: 'manage/users/{username}/disable',
  authLevel: 'anonymous',
  handler: disableUserHandler,
});

app.http('mgmtUserEnable', {
  methods: ['PUT', 'OPTIONS'],
  route: 'manage/users/{username}/enable',
  authLevel: 'anonymous',
  handler: enableUserHandler,
});

app.http('mgmtUserPassword', {
  methods: ['PUT', 'OPTIONS'],
  route: 'manage/users/{username}/password',
  authLevel: 'anonymous',
  handler: changePasswordHandler,
});
