import { InMemoryTokenStorage } from './InMemoryTokenStorage';
import type { UsageRecord, RetentionPolicy } from '../models/token';

let storage: InMemoryTokenStorage;

beforeEach(async () => {
  storage = new InMemoryTokenStorage();
  await storage.initialize({});
});

afterEach(async () => {
  await storage.close();
});

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    timestamp: '2025-01-15T10:00:00Z',
    service: 'openai',
    model: 'gpt-4',
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    cost_usd: 0.05,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

describe('Ingestion', () => {
  it('storeUsageRecords stores valid records', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord(),
      makeRecord({ timestamp: '2025-01-15T11:00:00Z' }),
    ]);

    expect(result.records_processed).toBe(2);
    expect(result.records_stored).toBe(2);
    expect(result.records_invalid).toBe(0);
    expect(result.records_duplicate).toBe(0);
  });

  it('rejects records with missing timestamp', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: '' }),
    ]);
    expect(result.records_invalid).toBe(1);
    expect(result.records_stored).toBe(0);
  });

  it('rejects records with zero-value timestamp', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: '0001-01-01T00:00:00Z' }),
    ]);
    expect(result.records_invalid).toBe(1);
    expect(result.records_stored).toBe(0);
  });

  it('rejects records with empty service', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ service: '' }),
    ]);
    expect(result.records_invalid).toBe(1);
    expect(result.records_stored).toBe(0);
  });

  it('rejects records with whitespace-only service', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ service: '   ' }),
    ]);
    expect(result.records_invalid).toBe(1);
    expect(result.records_stored).toBe(0);
  });

  it('rejects records with empty model', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ model: '' }),
    ]);
    expect(result.records_invalid).toBe(1);
    expect(result.records_stored).toBe(0);
  });

  it('deduplicates records with same hash', async () => {
    const record = makeRecord();
    const result1 = await storage.storeUsageRecords('client-1', [record]);
    expect(result1.records_stored).toBe(1);

    const result2 = await storage.storeUsageRecords('client-1', [record]);
    expect(result2.records_duplicate).toBe(1);
    expect(result2.records_stored).toBe(0);
  });

  it('mixed batch: valid + invalid + duplicate counted correctly', async () => {
    const validRecord = makeRecord({ timestamp: '2025-01-15T12:00:00Z' });
    const invalidRecord = makeRecord({ service: '' });
    // Store one first to create a duplicate
    await storage.storeUsageRecords('client-1', [makeRecord()]);

    const result = await storage.storeUsageRecords('client-1', [
      validRecord,             // valid - new
      invalidRecord,           // invalid
      makeRecord(),            // duplicate (same hash as previously stored)
    ]);

    expect(result.records_processed).toBe(3);
    expect(result.records_stored).toBe(1);
    expect(result.records_invalid).toBe(1);
    expect(result.records_duplicate).toBe(1);
  });

  it('storeUsageRecords includes errors for invalid records', async () => {
    const result = await storage.storeUsageRecords('client-1', [
      makeRecord({ service: '' }),
      makeRecord({ model: '' }),
    ]);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]).toContain('index 0');
    expect(result.errors[1]).toContain('index 1');
  });
});

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

describe('Query', () => {
  beforeEach(async () => {
    // Seed some records with different attributes
    await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: '2025-01-10T10:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.10 }),
      makeRecord({ timestamp: '2025-01-11T10:00:00Z', service: 'openai', model: 'gpt-3.5', cost_usd: 0.01 }),
      makeRecord({ timestamp: '2025-01-12T10:00:00Z', service: 'anthropic', model: 'claude-3', cost_usd: 0.08 }),
    ]);
    await storage.storeUsageRecords('client-2', [
      makeRecord({ timestamp: '2025-01-13T10:00:00Z', service: 'anthropic', model: 'claude-3', cost_usd: 0.07 }),
    ]);
  });

  it('queryUsage returns all records with no filters', async () => {
    const result = await storage.queryUsage({});
    expect(result.total_records).toBe(4);
  });

  it('queryUsage filters by time range', async () => {
    const result = await storage.queryUsage({
      start_time: '2025-01-11T00:00:00Z',
      end_time: '2025-01-13T00:00:00Z',
    });
    expect(result.total_records).toBe(2);
  });

  it('queryUsage filters by service', async () => {
    const result = await storage.queryUsage({ services: ['anthropic'] });
    expect(result.total_records).toBe(2);
    expect(result.records.every(r => r.service === 'anthropic')).toBe(true);
  });

  it('queryUsage filters by model', async () => {
    const result = await storage.queryUsage({ models: ['gpt-4'] });
    expect(result.total_records).toBe(1);
    expect(result.records[0]!.model).toBe('gpt-4');
  });

  it('queryUsage filters by client', async () => {
    const result = await storage.queryUsage({ client_ids: ['client-2'] });
    expect(result.total_records).toBe(1);
  });

  it('queryUsage pagination works', async () => {
    const page1 = await storage.queryUsage({ limit: 2, offset: 0 });
    expect(page1.records.length).toBe(2);
    expect(page1.total_records).toBe(4);

    const page2 = await storage.queryUsage({ limit: 2, offset: 2 });
    expect(page2.records.length).toBe(2);
  });

  it('queryUsage with aggregates', async () => {
    const result = await storage.queryUsage({
      aggregates: ['count', 'sum'],
    });
    expect(result.aggregates['count']).toBe(4);
    expect(result.aggregates['sum_cost_usd']).toBeCloseTo(0.26, 2);
  });
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

describe('Analytics', () => {
  beforeEach(async () => {
    await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: '2025-01-10T08:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.10, total_tokens: 200 }),
      makeRecord({ timestamp: '2025-01-10T14:00:00Z', service: 'openai', model: 'gpt-4', cost_usd: 0.15, total_tokens: 300 }),
      makeRecord({ timestamp: '2025-01-11T10:00:00Z', service: 'anthropic', model: 'claude-3', cost_usd: 0.08, total_tokens: 150 }),
    ]);
    await storage.storeUsageRecords('client-2', [
      makeRecord({ timestamp: '2025-01-11T12:00:00Z', service: 'openai', model: 'gpt-3.5', cost_usd: 0.02, total_tokens: 50 }),
    ]);
  });

  it('getUsageTrend returns correct daily buckets', async () => {
    const trend = await storage.getUsageTrend({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
      interval: 'day',
      metric: 'cost',
    });

    expect(trend.data_points.length).toBe(2);
    expect(trend.metric).toBe('cost');
    expect(trend.interval).toBe('day');
    // Day 1: 0.10 + 0.15 = 0.25
    expect(trend.data_points[0]!.value).toBeCloseTo(0.25, 2);
    // Day 2: 0.08 + 0.02 = 0.10
    expect(trend.data_points[1]!.value).toBeCloseTo(0.10, 2);
  });

  it('getUsageTrend returns correct hourly buckets', async () => {
    const trend = await storage.getUsageTrend({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-11T00:00:00Z',
      interval: 'hour',
      metric: 'cost',
    });

    // Two records on Jan 10 at different hours
    expect(trend.data_points.length).toBe(2);
    expect(trend.data_points[0]!.count).toBe(1);
    expect(trend.data_points[1]!.count).toBe(1);
  });

  it('getTopUsage ranks by cost correctly', async () => {
    const top = await storage.getTopUsage({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
      group_by: 'service',
      metric: 'cost',
      limit: 10,
    });

    expect(top.rankings.length).toBe(2);
    // openai: 0.10 + 0.15 + 0.02 = 0.27, anthropic: 0.08
    expect(top.rankings[0]!.name).toBe('openai');
    expect(top.rankings[0]!.value).toBeCloseTo(0.27, 2);
  });

  it('getTopUsage ranks by tokens correctly', async () => {
    const top = await storage.getTopUsage({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
      group_by: 'model',
      metric: 'total_tokens',
      limit: 10,
    });

    expect(top.rankings.length).toBe(3);
    // gpt-4: 200+300=500, claude-3: 150, gpt-3.5: 50
    expect(top.rankings[0]!.name).toBe('gpt-4');
    expect(top.rankings[0]!.value).toBe(500);
  });

  it('getUsageSummary totals match', async () => {
    const summary = await storage.getUsageSummary({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
    });

    expect(summary.total_cost).toBeCloseTo(0.35, 2);
    expect(summary.total_tokens).toBe(700);
    expect(summary.total_requests).toBe(4);
  });

  it('getUsageSummary service breakdown is correct', async () => {
    const summary = await storage.getUsageSummary({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
    });

    expect(summary.service_breakdown['openai']).toBeDefined();
    expect(summary.service_breakdown['anthropic']).toBeDefined();
    expect(summary.service_breakdown['openai']!.requests).toBe(3);
    expect(summary.service_breakdown['anthropic']!.requests).toBe(1);
  });

  it('getCostBreakdown percentages sum to approximately 100', async () => {
    const breakdown = await storage.getCostBreakdown({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
      breakdown_by: ['service'],
    });

    const totalPct = breakdown.breakdowns.reduce((s, b) => s + b.percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it('getCostBreakdown with multiple dimensions', async () => {
    const breakdown = await storage.getCostBreakdown({
      start_time: '2025-01-10T00:00:00Z',
      end_time: '2025-01-12T00:00:00Z',
      breakdown_by: ['service', 'model'],
    });

    expect(breakdown.breakdowns.length).toBe(3); // openai/gpt-4, openai/gpt-3.5, anthropic/claude-3
    expect(breakdown.total_cost).toBeCloseTo(0.35, 2);
  });
});

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

describe('Retention', () => {
  it('applyRetentionPolicy deletes old records', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: oldDate }),
      makeRecord({ timestamp: recentDate }),
    ]);

    const policy: RetentionPolicy = {
      default_retention_days: 30,
      service_retention: {},
      client_retention: {},
      aggregate_retention_days: 365,
    };

    const result = await storage.applyRetentionPolicy(policy);
    expect(result.records_deleted).toBe(1);

    // Verify only recent record remains
    const query = await storage.queryUsage({});
    expect(query.total_records).toBe(1);
  });

  it('per-service retention overrides work', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    await storage.storeUsageRecords('client-1', [
      makeRecord({ timestamp: sixtyDaysAgo, service: 'important-service' }),
      makeRecord({ timestamp: sixtyDaysAgo, service: 'normal-service' }),
    ]);

    const policy: RetentionPolicy = {
      default_retention_days: 30, // 30 day default would delete both
      service_retention: { 'important-service': 90 }, // But important gets 90 days
      client_retention: {},
      aggregate_retention_days: 365,
    };

    const result = await storage.applyRetentionPolicy(policy);
    expect(result.records_deleted).toBe(1);

    const query = await storage.queryUsage({});
    expect(query.total_records).toBe(1);
    expect(query.records[0]!.service).toBe('important-service');
  });

  it('per-client retention overrides work', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    await storage.storeUsageRecords('vip-client', [
      makeRecord({ timestamp: sixtyDaysAgo }),
    ]);
    await storage.storeUsageRecords('normal-client', [
      makeRecord({ timestamp: sixtyDaysAgo, session_id: 'normal-sess' }),
    ]);

    const policy: RetentionPolicy = {
      default_retention_days: 30,
      service_retention: {},
      client_retention: { 'vip-client': 90 },
      aggregate_retention_days: 365,
    };

    const result = await storage.applyRetentionPolicy(policy);
    expect(result.records_deleted).toBe(1);

    const query = await storage.queryUsage({});
    expect(query.total_records).toBe(1);
    expect(query.records[0]!.client_id).toBe('vip-client');
  });

  it('retention is idempotent (second run deletes 0)', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    await storage.storeUsageRecords('client-1', [makeRecord({ timestamp: oldDate })]);

    const policy: RetentionPolicy = {
      default_retention_days: 30,
      service_retention: {},
      client_retention: {},
      aggregate_retention_days: 365,
    };

    const result1 = await storage.applyRetentionPolicy(policy);
    expect(result1.records_deleted).toBe(1);

    const result2 = await storage.applyRetentionPolicy(policy);
    expect(result2.records_deleted).toBe(0);
  });
});
