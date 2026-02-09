import { app, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import { ensureInitialized } from './_init.js';
import { errorResponse, jsonResponse, handleError, handleOptions, authenticateRequest } from './_helpers.js';
import { TrendInterval, TrendMetric } from '../models/index.js';

async function summaryHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();

    const startTime = request.query.get('start_time') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = request.query.get('end_time') ?? new Date().toISOString();
    const clientIdsParam = request.query.get('client_ids');
    const clientIds = clientIdsParam ? clientIdsParam.split(',') : undefined;

    const summary = await services.tokenStorage.getUsageSummary({
      start_time: startTime,
      end_time: endTime,
      client_ids: clientIds,
    });

    return jsonResponse(200, summary);
  } catch (err) {
    return handleError(err);
  }
}

async function trendHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();

    const startTime = request.query.get('start_time') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = request.query.get('end_time') ?? new Date().toISOString();
    const interval = (request.query.get('interval') ?? 'day') as TrendInterval;
    const metric = (request.query.get('metric') ?? 'cost') as TrendMetric;
    const clientIdsParam = request.query.get('client_ids');
    const servicesParam = request.query.get('services');
    const modelsParam = request.query.get('models');

    const trend = await services.tokenStorage.getUsageTrend({
      start_time: startTime,
      end_time: endTime,
      interval,
      metric,
      client_ids: clientIdsParam ? clientIdsParam.split(',') : undefined,
      services: servicesParam ? servicesParam.split(',') : undefined,
      models: modelsParam ? modelsParam.split(',') : undefined,
    });

    return jsonResponse(200, trend);
  } catch (err) {
    return handleError(err);
  }
}

async function topHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();

    const startTime = request.query.get('start_time') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = request.query.get('end_time') ?? new Date().toISOString();
    const groupBy = request.query.get('group_by') ?? 'model';
    const metric = request.query.get('metric') ?? 'cost';
    const limit = parseInt(request.query.get('limit') ?? '10', 10);
    const clientIdsParam = request.query.get('client_ids');

    const result = await services.tokenStorage.getTopUsage({
      start_time: startTime,
      end_time: endTime,
      group_by: groupBy,
      metric,
      limit,
      client_ids: clientIdsParam ? clientIdsParam.split(',') : undefined,
    });

    return jsonResponse(200, result);
  } catch (err) {
    return handleError(err);
  }
}

async function costBreakdownHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponse> {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const user = await authenticateRequest(request);
    if (!user) {
      return errorResponse(401, 'unauthorized', 'Valid JWT token required');
    }

    const services = await ensureInitialized();

    const startTime = request.query.get('start_time') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endTime = request.query.get('end_time') ?? new Date().toISOString();
    const breakdownByParam = request.query.get('breakdown_by') ?? 'service,model';
    const breakdownBy = breakdownByParam.split(',');
    const clientIdsParam = request.query.get('client_ids');
    const servicesParam = request.query.get('services');
    const modelsParam = request.query.get('models');

    const result = await services.tokenStorage.getCostBreakdown({
      start_time: startTime,
      end_time: endTime,
      breakdown_by: breakdownBy,
      client_ids: clientIdsParam ? clientIdsParam.split(',') : undefined,
      services: servicesParam ? servicesParam.split(',') : undefined,
      models: modelsParam ? modelsParam.split(',') : undefined,
    });

    return jsonResponse(200, result);
  } catch (err) {
    return handleError(err);
  }
}

app.http('adminAnalyticsSummary', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/analytics/summary',
  authLevel: 'anonymous',
  handler: summaryHandler,
});

app.http('adminAnalyticsTrend', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/analytics/trend',
  authLevel: 'anonymous',
  handler: trendHandler,
});

app.http('adminAnalyticsTop', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/analytics/top',
  authLevel: 'anonymous',
  handler: topHandler,
});

app.http('adminAnalyticsCostBreakdown', {
  methods: ['GET', 'OPTIONS'],
  route: 'v1/admin/analytics/cost-breakdown',
  authLevel: 'anonymous',
  handler: costBreakdownHandler,
});
