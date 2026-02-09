import {
  UsageRecord, ClientRecordBatch,
  IngestionResult, BatchIngestionResult,
  UsageQuery, UsageQueryResult,
  TrendRequest, TrendData,
  TopUsageRequest, TopUsageResult,
  UsageSummaryRequest, UsageSummary,
  CostBreakdownRequest, CostBreakdown,
  ProjectionRequest, CostProjection,
  RetentionPolicy, RetentionInfo, RetentionResult,
  ExportRequest, ExportResult,
  StorageHealth, StorageStats, OptimizationResult,
} from '../models/index.js';

export interface ITokenStoragePlugin {
  // Lifecycle
  initialize(config: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<StorageHealth>;
  close(): Promise<void>;

  // Ingestion
  storeUsageRecords(clientId: string, records: UsageRecord[]): Promise<IngestionResult>;
  storeUsageRecordsBatch(batches: ClientRecordBatch[]): Promise<BatchIngestionResult>;

  // Query
  queryUsage(query: UsageQuery): Promise<UsageQueryResult>;
  getUsageTrend(request: TrendRequest): Promise<TrendData>;
  getTopUsage(request: TopUsageRequest): Promise<TopUsageResult>;
  getUsageSummary(request: UsageSummaryRequest): Promise<UsageSummary>;
  getCostBreakdown(request: CostBreakdownRequest): Promise<CostBreakdown>;

  // Projection
  calculateProjectedCost(request: ProjectionRequest): Promise<CostProjection>;

  // Management
  getRetentionInfo(): Promise<RetentionInfo>;
  applyRetentionPolicy(policy: RetentionPolicy): Promise<RetentionResult>;
  exportUsageData(request: ExportRequest): Promise<ExportResult>;
  getStorageStats(): Promise<StorageStats>;
  optimizeStorage(): Promise<OptimizationResult>;
}
