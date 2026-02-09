// Token usage data models

export interface UsageRecord {
  timestamp: string;
  service: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  cost_model?: string;
  session_id?: string;
  request_id?: string;
  user_id?: string;
  application?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
  client_id?: string;
  ingested_at?: string;
  record_hash?: string;
}

export interface ClientRecordBatch {
  client_id: string;
  records: UsageRecord[];
}

export interface IngestionResult {
  records_processed: number;
  records_stored: number;
  records_duplicate: number;
  records_invalid: number;
  processing_time_ms: number;
  errors: string[];
}

export interface BatchIngestionResult {
  total_records_processed: number;
  total_records_stored: number;
  total_records_duplicate: number;
  total_records_invalid: number;
  client_results: Record<string, IngestionResult>;
  processing_time_ms: number;
}

// Query models

export interface UsageQueryOrderBy {
  field: string;
  desc: boolean;
}

export interface UsageQuery {
  start_time?: string;
  end_time?: string;
  client_ids?: string[];
  services?: string[];
  models?: string[];
  applications?: string[] | null;
  environments?: string[] | null;
  session_id?: string | null;
  user_id?: string | null;
  group_by?: string[];
  aggregates?: string[];
  limit?: number;
  offset?: number;
  order_by?: UsageQueryOrderBy[];
}

export interface UsageQueryResult {
  records: UsageRecord[];
  aggregates: Record<string, number>;
  total_records: number;
  query_time_ms: number;
}

// Trend models

export type TrendInterval = 'hour' | 'day' | 'week' | 'month';
export type TrendMetric = 'cost' | 'total_tokens' | 'input_tokens' | 'output_tokens' | 'request_count';

export interface TrendRequest {
  start_time: string;
  end_time: string;
  interval: TrendInterval;
  metric: TrendMetric;
  client_ids?: string[] | null;
  services?: string[] | null;
  models?: string[] | null;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  count: number;
}

export interface TrendData {
  data_points: TrendDataPoint[];
  total_value: number;
  average_value: number;
  metric: string;
  interval: string;
}

// Top usage models

export interface TopUsageRequest {
  start_time: string;
  end_time: string;
  group_by: string;
  metric: string;
  limit: number;
  client_ids?: string[] | null;
}

export interface TopUsageRanking {
  name: string;
  value: number;
  percentage: number;
  record_count: number;
}

export interface TopUsageResult {
  rankings: TopUsageRanking[];
  total_value: number;
  requested_top: number;
}

// Cost breakdown models

export interface CostBreakdownRequest {
  start_time: string;
  end_time: string;
  breakdown_by: string[];
  client_ids?: string[] | null;
  services?: string[] | null;
  models?: string[] | null;
}

export interface CostBreakdownEntry {
  dimensions: Record<string, string>;
  cost: number;
  percentage: number;
  token_count: number;
  request_count: number;
}

export interface CostBreakdown {
  total_cost: number;
  breakdowns: CostBreakdownEntry[];
  currency: string;
}

// Usage summary models

export interface UsageSummaryRequest {
  start_time: string;
  end_time: string;
  client_ids?: string[] | null;
}

export interface ServiceBreakdown {
  service: string;
  cost: number;
  tokens: number;
  requests: number;
  percentage: number;
}

export interface ModelBreakdown {
  model: string;
  cost: number;
  tokens: number;
  requests: number;
  percentage: number;
}

export interface ClientBreakdown {
  client_id: string;
  cost: number;
  tokens: number;
  requests: number;
  percentage: number;
}

export interface DailyTrendPoint {
  date: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface UsageSummary {
  period: {
    start_time: string;
    end_time: string;
  };
  total_cost: number;
  total_tokens: number;
  total_requests: number;
  service_breakdown: Record<string, ServiceBreakdown>;
  model_breakdown: Record<string, ModelBreakdown>;
  client_breakdown: Record<string, ClientBreakdown>;
  daily_trend: DailyTrendPoint[];
  cost_growth_rate: number;
  token_growth_rate: number;
}

// Projection models

export type ProjectionPeriod = 'daily' | 'weekly' | 'monthly';
export type ProjectionMethod = 'linear' | 'exponential' | 'seasonal' | 'average';

export interface ProjectionRequest {
  base_start_time: string;
  base_end_time: string;
  project_period: ProjectionPeriod;
  method: ProjectionMethod;
  client_ids?: string[] | null;
  services?: string[] | null;
  models?: string[] | null;
}

export interface ProjectionTrendPoint {
  timestamp: string;
  value: number;
  count: number;
}

export interface CostProjection {
  method: string;
  base_period: {
    start_time: string;
    end_time: string;
  };
  projected_cost: number;
  projected_tokens: number;
  projected_requests: number;
  confidence: number;
  historical_trend: ProjectionTrendPoint[];
  projected_trend: ProjectionTrendPoint[];
}

// Retention models

export interface RetentionPolicy {
  default_retention_days: number;
  service_retention: Record<string, number>;
  client_retention: Record<string, number>;
  aggregate_retention_days: number;
}

export interface RetentionInfo {
  total_records: number;
  oldest_record: string | null;
  newest_record: string | null;
  records_by_age: {
    '30_days': number;
    '90_days': number;
    '180_days': number;
    '365_days': number;
  };
  estimated_size_gb: number;
}

export interface RetentionResult {
  records_deleted: number;
  storage_freed_gb: number;
  processing_time_ms: number;
}

// Export models

export type ExportFormat = 'jsonl' | 'csv' | 'parquet';
export type CompressionOption = 'none' | 'gzip' | 'zstd';

export interface ExportRequest {
  start_time: string;
  end_time: string;
  format: ExportFormat;
  compression: CompressionOption;
  client_ids?: string[] | null;
  services?: string[] | null;
  models?: string[] | null;
  destination: string;
}

export interface ExportResult {
  records_exported: number;
  file_size_bytes: number;
  file_path: string;
  processing_time_ms: number;
}

// Storage health models

export interface StorageHealth {
  status: string;
  message: string;
  checked_at: string;
}

export interface StorageStats {
  total_records: number;
  total_size_gb: number;
  records_today: number;
}

export interface OptimizationResult {
  status: string;
  processing_time_ms: number;
}
