import { createHash } from 'crypto';
import { ITokenStoragePlugin } from '../interfaces/ITokenStoragePlugin.js';
import {
  UsageRecord, ClientRecordBatch,
  IngestionResult, BatchIngestionResult,
  UsageQuery, UsageQueryResult,
  TrendRequest, TrendData, TrendDataPoint,
  TopUsageRequest, TopUsageResult,
  UsageSummaryRequest, UsageSummary,
  CostBreakdownRequest, CostBreakdown,
  ProjectionRequest, CostProjection,
  RetentionPolicy, RetentionInfo, RetentionResult,
  ExportRequest, ExportResult,
  StorageHealth, StorageStats, OptimizationResult,
} from '../models/index.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function computeRecordHash(record: UsageRecord): string {
  const input = [
    record.timestamp,
    record.service,
    record.model,
    record.input_tokens ?? '',
    record.output_tokens ?? '',
    record.total_tokens ?? '',
    record.cost_usd ?? '',
    record.session_id ?? '',
    record.request_id ?? '',
    record.user_id ?? '',
    record.application ?? '',
    record.environment ?? '',
  ].join('|');

  return createHash('sha256').update(input).digest('hex');
}

function isValidRecord(record: UsageRecord): boolean {
  if (!record.timestamp || record.timestamp === '' || record.timestamp === '0001-01-01T00:00:00Z') {
    return false;
  }
  if (!record.service || record.service.trim() === '') return false;
  if (!record.model || record.model.trim() === '') return false;
  return true;
}

function getDateBucket(timestamp: string, interval: string): string {
  const d = new Date(timestamp);
  switch (interval) {
    case 'hour': {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).toISOString();
    }
    case 'day': {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    }
    case 'week': {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff).toISOString();
    }
    case 'month': {
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    }
    default:
      return d.toISOString();
  }
}

function getMetricValue(record: UsageRecord, metric: string): number {
  switch (metric) {
    case 'cost': return record.cost_usd ?? 0;
    case 'total_tokens': return record.total_tokens ?? 0;
    case 'input_tokens': return record.input_tokens ?? 0;
    case 'output_tokens': return record.output_tokens ?? 0;
    case 'request_count': return 1;
    default: return 0;
  }
}

function getGroupByField(record: UsageRecord, field: string): string {
  switch (field) {
    case 'service': return record.service;
    case 'model': return record.model;
    case 'client_id': return record.client_id ?? '';
    case 'application': return record.application ?? '';
    case 'environment': return record.environment ?? '';
    default: return '';
  }
}

export class InMemoryTokenStorage implements ITokenStoragePlugin {
  private records: UsageRecord[] = [];
  private hashes = new Set<string>();

  async initialize(_config: Record<string, unknown>): Promise<void> {
    this.records = [];
    this.hashes.clear();
  }

  async healthCheck(): Promise<StorageHealth> {
    return {
      status: 'healthy',
      message: `In-memory storage, ${this.records.length} records`,
      checked_at: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    this.records = [];
    this.hashes.clear();
  }

  // --- Ingestion ---

  async storeUsageRecords(clientId: string, records: UsageRecord[]): Promise<IngestionResult> {
    const startTime = Date.now();
    let stored = 0;
    let duplicate = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;

      if (!isValidRecord(record)) {
        invalid++;
        errors.push(`Invalid record at index ${i}`);
        continue;
      }

      const enriched: UsageRecord = {
        ...record,
        client_id: clientId,
        ingested_at: new Date().toISOString(),
      };
      enriched.record_hash = computeRecordHash(enriched);

      if (this.hashes.has(enriched.record_hash)) {
        duplicate++;
        continue;
      }

      this.hashes.add(enriched.record_hash);
      this.records.push(enriched);
      stored++;
    }

    return {
      records_processed: records.length,
      records_stored: stored,
      records_duplicate: duplicate,
      records_invalid: invalid,
      processing_time_ms: Date.now() - startTime,
      errors,
    };
  }

  async storeUsageRecordsBatch(batches: ClientRecordBatch[]): Promise<BatchIngestionResult> {
    const startTime = Date.now();
    const clientResults: Record<string, IngestionResult> = {};
    let totalProcessed = 0;
    let totalStored = 0;
    let totalDuplicate = 0;
    let totalInvalid = 0;

    for (const batch of batches) {
      const result = await this.storeUsageRecords(batch.client_id, batch.records);
      clientResults[batch.client_id] = result;
      totalProcessed += result.records_processed;
      totalStored += result.records_stored;
      totalDuplicate += result.records_duplicate;
      totalInvalid += result.records_invalid;
    }

    return {
      total_records_processed: totalProcessed,
      total_records_stored: totalStored,
      total_records_duplicate: totalDuplicate,
      total_records_invalid: totalInvalid,
      client_results: clientResults,
      processing_time_ms: Date.now() - startTime,
    };
  }

  // --- Query ---

  private filterRecords(query: {
    start_time?: string;
    end_time?: string;
    client_ids?: string[] | null;
    services?: string[] | null;
    models?: string[] | null;
    applications?: string[] | null;
    environments?: string[] | null;
    session_id?: string | null;
    user_id?: string | null;
  }): UsageRecord[] {
    let filtered = [...this.records];

    if (query.start_time) {
      const start = new Date(query.start_time).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() >= start);
    }
    if (query.end_time) {
      const end = new Date(query.end_time).getTime();
      filtered = filtered.filter(r => new Date(r.timestamp).getTime() < end);
    }
    if (query.client_ids && query.client_ids.length > 0) {
      const ids = query.client_ids;
      filtered = filtered.filter(r => ids.includes(r.client_id ?? ''));
    }
    if (query.services && query.services.length > 0) {
      const services = query.services;
      filtered = filtered.filter(r => services.includes(r.service));
    }
    if (query.models && query.models.length > 0) {
      const models = query.models;
      filtered = filtered.filter(r => models.includes(r.model));
    }
    if (query.applications && query.applications.length > 0) {
      const apps = query.applications;
      filtered = filtered.filter(r => apps.includes(r.application ?? ''));
    }
    if (query.environments && query.environments.length > 0) {
      const envs = query.environments;
      filtered = filtered.filter(r => envs.includes(r.environment ?? ''));
    }
    if (query.session_id) {
      filtered = filtered.filter(r => r.session_id === query.session_id);
    }
    if (query.user_id) {
      filtered = filtered.filter(r => r.user_id === query.user_id);
    }

    return filtered;
  }

  async queryUsage(query: UsageQuery): Promise<UsageQueryResult> {
    const startTime = Date.now();
    const filtered = this.filterRecords(query);
    const total = filtered.length;

    // Compute aggregates
    const aggregates: Record<string, number> = {};
    if (query.aggregates) {
      if (query.aggregates.includes('count')) {
        aggregates['count'] = total;
      }
      if (query.aggregates.includes('sum')) {
        aggregates['sum_cost_usd'] = filtered.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
        aggregates['sum_input_tokens'] = filtered.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
        aggregates['sum_output_tokens'] = filtered.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
        aggregates['sum_total_tokens'] = filtered.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
      }
      if (query.aggregates.includes('avg')) {
        aggregates['avg_cost_usd'] = total > 0
          ? filtered.reduce((s, r) => s + (r.cost_usd ?? 0), 0) / total
          : 0;
      }
    }

    // Sort
    let sorted = filtered;
    if (query.order_by && query.order_by.length > 0) {
      const orderRules = query.order_by;
      sorted = [...filtered].sort((a, b) => {
        for (const ob of orderRules) {
          const aVal = (a as unknown as Record<string, unknown>)[ob.field];
          const bVal = (b as unknown as Record<string, unknown>)[ob.field];
          if (aVal == null && bVal == null) continue;
          if (aVal == null) return ob.desc ? 1 : -1;
          if (bVal == null) return ob.desc ? -1 : 1;
          const cmp = String(aVal).localeCompare(String(bVal));
          if (cmp !== 0) return ob.desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    // Paginate
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const page = sorted.slice(offset, offset + limit);

    return {
      records: page.map(r => deepClone(r)),
      aggregates,
      total_records: total,
      query_time_ms: Date.now() - startTime,
    };
  }

  async getUsageTrend(request: TrendRequest): Promise<TrendData> {
    const filtered = this.filterRecords(request);
    const buckets = new Map<string, { value: number; count: number }>();

    for (const record of filtered) {
      const bucket = getDateBucket(record.timestamp, request.interval);
      const current = buckets.get(bucket) ?? { value: 0, count: 0 };
      current.value += getMetricValue(record, request.metric);
      current.count += 1;
      buckets.set(bucket, current);
    }

    const dataPoints: TrendDataPoint[] = Array.from(buckets.entries())
      .map(([ts, data]) => ({ timestamp: ts, value: Math.round(data.value * 100) / 100, count: data.count }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const totalValue = dataPoints.reduce((s, d) => s + d.value, 0);
    const avgValue = dataPoints.length > 0 ? totalValue / dataPoints.length : 0;

    return {
      data_points: dataPoints,
      total_value: Math.round(totalValue * 100) / 100,
      average_value: Math.round(avgValue * 100) / 100,
      metric: request.metric,
      interval: request.interval,
    };
  }

  async getTopUsage(request: TopUsageRequest): Promise<TopUsageResult> {
    const filtered = this.filterRecords(request);
    const groups = new Map<string, { value: number; count: number }>();

    for (const record of filtered) {
      const key = getGroupByField(record, request.group_by);
      const current = groups.get(key) ?? { value: 0, count: 0 };
      current.value += getMetricValue(record, request.metric);
      current.count += 1;
      groups.set(key, current);
    }

    const totalValue = Array.from(groups.values()).reduce((s, g) => s + g.value, 0);

    const rankings = Array.from(groups.entries())
      .map(([name, data]) => ({
        name,
        value: Math.round(data.value * 100) / 100,
        percentage: totalValue > 0 ? Math.round((data.value / totalValue) * 1000) / 10 : 0,
        record_count: data.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, request.limit);

    return {
      rankings,
      total_value: Math.round(totalValue * 100) / 100,
      requested_top: request.limit,
    };
  }

  async getUsageSummary(request: UsageSummaryRequest): Promise<UsageSummary> {
    const filtered = this.filterRecords(request);

    const totalCost = filtered.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const totalTokens = filtered.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    const totalRequests = filtered.length;

    // Service breakdown
    const serviceMap = new Map<string, { cost: number; tokens: number; requests: number }>();
    for (const r of filtered) {
      const entry = serviceMap.get(r.service) ?? { cost: 0, tokens: 0, requests: 0 };
      entry.cost += r.cost_usd ?? 0;
      entry.tokens += r.total_tokens ?? 0;
      entry.requests += 1;
      serviceMap.set(r.service, entry);
    }
    const serviceBreakdown: Record<string, { service: string; cost: number; tokens: number; requests: number; percentage: number }> = {};
    for (const [service, data] of serviceMap.entries()) {
      serviceBreakdown[service] = {
        service,
        cost: Math.round(data.cost * 100) / 100,
        tokens: data.tokens,
        requests: data.requests,
        percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 1000) / 10 : 0,
      };
    }

    // Model breakdown
    const modelMap = new Map<string, { cost: number; tokens: number; requests: number }>();
    for (const r of filtered) {
      const entry = modelMap.get(r.model) ?? { cost: 0, tokens: 0, requests: 0 };
      entry.cost += r.cost_usd ?? 0;
      entry.tokens += r.total_tokens ?? 0;
      entry.requests += 1;
      modelMap.set(r.model, entry);
    }
    const modelBreakdown: Record<string, { model: string; cost: number; tokens: number; requests: number; percentage: number }> = {};
    for (const [model, data] of modelMap.entries()) {
      modelBreakdown[model] = {
        model,
        cost: Math.round(data.cost * 100) / 100,
        tokens: data.tokens,
        requests: data.requests,
        percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 1000) / 10 : 0,
      };
    }

    // Client breakdown
    const clientMap = new Map<string, { cost: number; tokens: number; requests: number }>();
    for (const r of filtered) {
      const cid = r.client_id ?? '';
      const entry = clientMap.get(cid) ?? { cost: 0, tokens: 0, requests: 0 };
      entry.cost += r.cost_usd ?? 0;
      entry.tokens += r.total_tokens ?? 0;
      entry.requests += 1;
      clientMap.set(cid, entry);
    }
    const clientBreakdown: Record<string, { client_id: string; cost: number; tokens: number; requests: number; percentage: number }> = {};
    for (const [clientId, data] of clientMap.entries()) {
      clientBreakdown[clientId] = {
        client_id: clientId,
        cost: Math.round(data.cost * 100) / 100,
        tokens: data.tokens,
        requests: data.requests,
        percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 1000) / 10 : 0,
      };
    }

    // Daily trend
    const dailyMap = new Map<string, { cost: number; tokens: number; requests: number }>();
    for (const r of filtered) {
      const d = new Date(r.timestamp);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const entry = dailyMap.get(dateKey) ?? { cost: 0, tokens: 0, requests: 0 };
      entry.cost += r.cost_usd ?? 0;
      entry.tokens += r.total_tokens ?? 0;
      entry.requests += 1;
      dailyMap.set(dateKey, entry);
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        cost: Math.round(data.cost * 100) / 100,
        tokens: data.tokens,
        requests: data.requests,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Growth rates (compare first half vs second half)
    let costGrowthRate = 0;
    let tokenGrowthRate = 0;
    if (dailyTrend.length >= 2) {
      const mid = Math.floor(dailyTrend.length / 2);
      const firstHalf = dailyTrend.slice(0, mid);
      const secondHalf = dailyTrend.slice(mid);
      const firstCost = firstHalf.reduce((s, d) => s + d.cost, 0);
      const secondCost = secondHalf.reduce((s, d) => s + d.cost, 0);
      const firstTokens = firstHalf.reduce((s, d) => s + d.tokens, 0);
      const secondTokens = secondHalf.reduce((s, d) => s + d.tokens, 0);
      if (firstCost > 0) costGrowthRate = Math.round(((secondCost - firstCost) / firstCost) * 1000) / 10;
      if (firstTokens > 0) tokenGrowthRate = Math.round(((secondTokens - firstTokens) / firstTokens) * 1000) / 10;
    }

    return {
      period: {
        start_time: request.start_time,
        end_time: request.end_time,
      },
      total_cost: Math.round(totalCost * 100) / 100,
      total_tokens: totalTokens,
      total_requests: totalRequests,
      service_breakdown: serviceBreakdown,
      model_breakdown: modelBreakdown,
      client_breakdown: clientBreakdown,
      daily_trend: dailyTrend,
      cost_growth_rate: costGrowthRate,
      token_growth_rate: tokenGrowthRate,
    };
  }

  async getCostBreakdown(request: CostBreakdownRequest): Promise<CostBreakdown> {
    const filtered = this.filterRecords(request);
    const groups = new Map<string, { cost: number; tokens: number; requests: number }>();

    for (const record of filtered) {
      const dims: Record<string, string> = {};
      for (const dim of request.breakdown_by) {
        dims[dim] = getGroupByField(record, dim);
      }
      const key = JSON.stringify(dims);
      const entry = groups.get(key) ?? { cost: 0, tokens: 0, requests: 0 };
      entry.cost += record.cost_usd ?? 0;
      entry.tokens += (record.total_tokens ?? 0);
      entry.requests += 1;
      groups.set(key, entry);
    }

    const totalCost = Array.from(groups.values()).reduce((s, g) => s + g.cost, 0);

    const breakdowns = Array.from(groups.entries()).map(([key, data]) => ({
      dimensions: JSON.parse(key) as Record<string, string>,
      cost: Math.round(data.cost * 100) / 100,
      percentage: totalCost > 0 ? Math.round((data.cost / totalCost) * 1000) / 10 : 0,
      token_count: data.tokens,
      request_count: data.requests,
    })).sort((a, b) => b.cost - a.cost);

    return {
      total_cost: Math.round(totalCost * 100) / 100,
      breakdowns,
      currency: 'USD',
    };
  }

  // --- Projection ---

  async calculateProjectedCost(request: ProjectionRequest): Promise<CostProjection> {
    const filtered = this.filterRecords({
      start_time: request.base_start_time,
      end_time: request.base_end_time,
      client_ids: request.client_ids,
      services: request.services,
      models: request.models,
    });

    // Build daily aggregates for the base period
    const dailyMap = new Map<string, { value: number; count: number }>();
    for (const r of filtered) {
      const bucket = getDateBucket(r.timestamp, 'day');
      const current = dailyMap.get(bucket) ?? { value: 0, count: 0 };
      current.value += r.cost_usd ?? 0;
      current.count += 1;
      dailyMap.set(bucket, current);
    }

    const historicalTrend = Array.from(dailyMap.entries())
      .map(([ts, data]) => ({ timestamp: ts, value: Math.round(data.value * 100) / 100, count: data.count }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const totalCost = filtered.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const totalTokens = filtered.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
    const totalRequests = filtered.length;

    // Calculate days in base period
    const baseStart = new Date(request.base_start_time).getTime();
    const baseEnd = new Date(request.base_end_time).getTime();
    const baseDays = Math.max(1, (baseEnd - baseStart) / (24 * 60 * 60 * 1000));

    // Project forward
    let projectionDays: number;
    switch (request.project_period) {
      case 'daily': projectionDays = 1; break;
      case 'weekly': projectionDays = 7; break;
      case 'monthly': projectionDays = 30; break;
      default: projectionDays = 30;
    }

    let projectedCost: number;
    let confidence: number;

    switch (request.method) {
      case 'linear': {
        // Simple linear: average daily cost * projection days
        const dailyCost = totalCost / baseDays;
        projectedCost = dailyCost * projectionDays;
        confidence = historicalTrend.length >= 7 ? 0.85 : 0.6;
        break;
      }
      case 'exponential': {
        if (historicalTrend.length >= 2) {
          const firstHalf = historicalTrend.slice(0, Math.floor(historicalTrend.length / 2));
          const secondHalf = historicalTrend.slice(Math.floor(historicalTrend.length / 2));
          const firstAvg = firstHalf.reduce((s, p) => s + p.value, 0) / (firstHalf.length || 1);
          const secondAvg = secondHalf.reduce((s, p) => s + p.value, 0) / (secondHalf.length || 1);
          const growthRate = firstAvg > 0 ? (secondAvg / firstAvg) : 1;
          const dailyCost = totalCost / baseDays;
          projectedCost = dailyCost * projectionDays * growthRate;
        } else {
          projectedCost = (totalCost / baseDays) * projectionDays;
        }
        confidence = 0.7;
        break;
      }
      case 'seasonal':
      case 'average':
      default: {
        const dailyCost = totalCost / baseDays;
        projectedCost = dailyCost * projectionDays;
        confidence = 0.75;
        break;
      }
    }

    const ratio = baseDays > 0 ? projectionDays / baseDays : 1;

    return {
      method: request.method,
      base_period: {
        start_time: request.base_start_time,
        end_time: request.base_end_time,
      },
      projected_cost: Math.round(projectedCost * 100) / 100,
      projected_tokens: Math.round(totalTokens * ratio),
      projected_requests: Math.round(totalRequests * ratio),
      confidence,
      historical_trend: historicalTrend,
      projected_trend: [{
        timestamp: request.base_end_time,
        value: Math.round(projectedCost * 100) / 100,
        count: Math.round(totalRequests * ratio),
      }],
    };
  }

  // --- Management ---

  async getRetentionInfo(): Promise<RetentionInfo> {
    if (this.records.length === 0) {
      return {
        total_records: 0,
        oldest_record: null,
        newest_record: null,
        records_by_age: { '30_days': 0, '90_days': 0, '180_days': 0, '365_days': 0 },
        estimated_size_gb: 0,
      };
    }

    const sorted = [...this.records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];

    const now = Date.now();
    const d30 = now - 30 * 24 * 60 * 60 * 1000;
    const d90 = now - 90 * 24 * 60 * 60 * 1000;
    const d180 = now - 180 * 24 * 60 * 60 * 1000;
    const d365 = now - 365 * 24 * 60 * 60 * 1000;

    return {
      total_records: this.records.length,
      oldest_record: oldest?.timestamp ?? null,
      newest_record: newest?.timestamp ?? null,
      records_by_age: {
        '30_days': this.records.filter(r => new Date(r.timestamp).getTime() >= d30).length,
        '90_days': this.records.filter(r => new Date(r.timestamp).getTime() >= d90).length,
        '180_days': this.records.filter(r => new Date(r.timestamp).getTime() >= d180).length,
        '365_days': this.records.filter(r => new Date(r.timestamp).getTime() >= d365).length,
      },
      estimated_size_gb: Math.round((this.records.length * 500) / (1024 * 1024 * 1024) * 1000) / 1000,
    };
  }

  async applyRetentionPolicy(policy: RetentionPolicy): Promise<RetentionResult> {
    const startTime = Date.now();
    const now = Date.now();
    const defaultCutoff = now - policy.default_retention_days * 24 * 60 * 60 * 1000;
    const initialCount = this.records.length;

    this.records = this.records.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();

      // Check per-service retention
      const serviceRetention = policy.service_retention[record.service];
      if (serviceRetention !== undefined) {
        const serviceCutoff = now - serviceRetention * 24 * 60 * 60 * 1000;
        if (recordTime >= serviceCutoff) return true;
      }

      // Check per-client retention
      const clientRetention = policy.client_retention[record.client_id ?? ''];
      if (clientRetention !== undefined) {
        const clientCutoff = now - clientRetention * 24 * 60 * 60 * 1000;
        if (recordTime >= clientCutoff) return true;
      }

      // Apply default retention
      return recordTime >= defaultCutoff;
    });

    // Rebuild hash set
    this.hashes.clear();
    for (const record of this.records) {
      if (record.record_hash) {
        this.hashes.add(record.record_hash);
      }
    }

    const deleted = initialCount - this.records.length;

    return {
      records_deleted: deleted,
      storage_freed_gb: Math.round((deleted * 500) / (1024 * 1024 * 1024) * 1000) / 1000,
      processing_time_ms: Date.now() - startTime,
    };
  }

  async exportUsageData(request: ExportRequest): Promise<ExportResult> {
    const startTime = Date.now();
    const filtered = this.filterRecords(request);

    // In-memory plugin doesn't actually write files; return summary
    const dataStr = filtered.map(r => JSON.stringify(r)).join('\n');
    const sizeBytes = Buffer.byteLength(dataStr, 'utf8');

    return {
      records_exported: filtered.length,
      file_size_bytes: sizeBytes,
      file_path: request.destination,
      processing_time_ms: Date.now() - startTime,
    };
  }

  async getStorageStats(): Promise<StorageStats> {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const recordsToday = this.records.filter(
      r => r.ingested_at && new Date(r.ingested_at).getTime() >= todayStart
    ).length;

    return {
      total_records: this.records.length,
      total_size_gb: Math.round((this.records.length * 500) / (1024 * 1024 * 1024) * 1000) / 1000,
      records_today: recordsToday,
    };
  }

  async optimizeStorage(): Promise<OptimizationResult> {
    // No optimization needed for in-memory storage
    return {
      status: 'ok',
      processing_time_ms: 0,
    };
  }
}
