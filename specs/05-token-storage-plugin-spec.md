# Component Specification: Token Storage Plugin

## Overview

The Token Storage Plugin handles high-volume ingestion and analytics for AI token usage data. It's optimized for write-heavy workloads, time-series queries, and cost analysis. Unlike the Admin Storage Plugin which handles small-scale operational data, the Token Storage Plugin is designed for millions of usage records with efficient aggregation and reporting capabilities.

**Design Philosophy:**
- **Write-optimized** - Handle high-volume, continuous ingestion from many clients
- **Time-series focused** - Optimized for time-based queries and aggregations
- **Analytics-ready** - Support cost analysis, trending, and usage reporting
- **Retention-aware** - Efficient cleanup of old data based on configurable policies
- **Query flexibility** - Support both real-time dashboards and batch analytics

---

## Responsibilities

### Primary Functions
1. **High-Volume Ingestion** - Store token usage records from multiple clients efficiently
2. **Time-Series Queries** - Retrieve usage data with time-based filtering and aggregation
3. **Cost Analytics** - Aggregate spending by service, model, client, and time period
4. **Usage Reporting** - Support dashboard queries and scheduled report generation
5. **Data Retention** - Automatic cleanup of old records based on retention policies

### Secondary Functions
6. **Performance Optimization** - Efficient indexing and query optimization for large datasets
7. **Data Validation** - Ensure token usage records meet quality standards
8. **Batch Operations** - Support bulk inserts for improved write performance
9. **Export Capabilities** - Generate data exports for external analysis
10. **Health Monitoring** - Track storage performance and capacity metrics

---

## Plugin Interface

### Operation Table

| Operation | Input | Output | Behavior | Error Conditions |
|-----------|-------|--------|----------|-----------------|
| **InitializeAsync** | config (key-value map) | — | Connect to storage backend, create tables/indexes if needed | Connection failure, invalid config |
| **HealthCheckAsync** | — | StorageHealth | Test connectivity and report backend status | Backend unreachable |
| **CloseAsync** | — | — | Gracefully close connections and release resources | — |
| **StoreRawFile** | clientId, metadata, fileContent (bytes) | RawFileResult | Store the raw JSONL file and its metadata for later processing; generate ingestion ID; set status to `pending` | Storage full, connection error |
| **GetPendingRawFiles** | limit (integer, optional) | list of RawFile | Retrieve raw files with status `pending`, ordered by upload time (oldest first); limit defaults to 10 | — |
| **UpdateRawFileStatus** | ingestionId, status, processingResult (optional) | — | Update the status of a raw file to `processing`, `processed`, or `failed`; attach processing result if provided | File not found |
| **StoreUsageRecords** | clientId, list of UsageRecord | IngestionResult | Validate, deduplicate, and store records; set clientId and ingestedAt on each record; compute record hash for dedup | Validation failure, storage full, connection error |
| **StoreUsageRecordsBatch** | list of ClientRecordBatch | BatchIngestionResult | Process multiple client batches (optionally in parallel with bounded concurrency); aggregate per-client results | Partial failure (per-client results reported) |
| **QueryUsage** | UsageQuery | UsageQueryResult | Filter records by time range and criteria, apply grouping/aggregation, paginate results | Invalid query parameters |
| **GetUsageTrend** | TrendRequest | TrendData | Aggregate a metric into time-interval buckets over a date range | Invalid time range |
| **GetTopUsage** | TopUsageRequest | TopUsageResult | Rank entities (services, models, clients) by a metric over a date range | Invalid grouping field |
| **GetUsageSummary** | SummaryRequest | UsageSummary | Produce a comprehensive summary with breakdowns by service, model, and client, plus daily trend and growth rates | Invalid time range |
| **GetCostBreakdown** | CostBreakdownRequest | CostBreakdown | Break down costs by one or more dimensions, compute percentages | Invalid dimensions |
| **CalculateProjectedCost** | ProjectionRequest | CostProjection | Project future costs using a specified method (linear, exponential, seasonal, average) based on historical data | Insufficient data for projection |
| **GetRetentionInfo** | — | RetentionInfo | Report total record count, oldest/newest timestamps, size estimates, and records-by-age buckets | — |
| **ApplyRetentionPolicy** | RetentionPolicy | RetentionResult | Delete records older than policy thresholds (batched deletes to avoid long transactions); reclaim storage | Deletion failure |
| **ExportUsageData** | ExportRequest | ExportResult | Export filtered records to a file in the requested format (JSONL, CSV, Parquet) with optional compression | Export failure, disk full |
| **GetStorageStats** | — | StorageStats | Report total records, total storage size, and records ingested today | — |
| **OptimizeStorage** | — | OptimizationResult | Run backend-specific maintenance (vacuum, reindex, compaction) | Optimization failure |

---

## Data Models

### Core Usage Record

```json
{
  "timestamp": "2026-02-09T09:45:00Z",
  "service": "openai",
  "model": "gpt-4",
  "input_tokens": 1500,
  "output_tokens": 800,
  "total_tokens": 2300,
  "cost_usd": 0.0345,
  "cost_model": "2026-01-pricing",
  "session_id": "sess-abc-123",
  "request_id": "req-def-456",
  "user_id": "user@example.com",
  "application": "chat-assistant",
  "environment": "prod",
  "metadata": {
    "department": "engineering",
    "project": "alpha"
  },
  "client_id": "web-server-01",
  "ingested_at": "2026-02-09T09:46:12Z",
  "record_hash": "a1b2c3d4e5f6..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | datetime (ISO 8601) | Yes | When the token usage occurred |
| `service` | string | Yes | AI service provider ("openai", "anthropic", "azure-openai") |
| `model` | string | Yes | Model identifier ("gpt-4", "claude-3-sonnet", etc.) |
| `input_tokens` | integer | No | Number of input/prompt tokens |
| `output_tokens` | integer | No | Number of output/completion tokens |
| `total_tokens` | integer | No | Total tokens (input + output) |
| `cost_usd` | decimal | No | Cost in USD for this request |
| `cost_model` | string | No | Pricing model version used for cost calculation |
| `session_id` | string | No | Conversation/session identifier |
| `request_id` | string | No | Unique request identifier |
| `user_id` | string | No | User who initiated the request |
| `application` | string | No | Application name |
| `environment` | string | No | Deployment environment ("prod", "dev", "test") |
| `metadata` | key-value map | No | Arbitrary additional metadata |
| `client_id` | string | Set by storage | Client that submitted this record (set during ingestion) |
| `ingested_at` | datetime | Set by storage | When the record was stored (set during ingestion) |
| `record_hash` | string | Set by storage | SHA-256 hash for deduplication (set during ingestion) |

**Validation Rules:**
- `timestamp` must not be the zero/default value
- `service` must not be empty or whitespace
- `model` must not be empty or whitespace

**Deduplication Hash Computation:**
The record hash is computed from the concatenation of: `timestamp | service | model | input_tokens | output_tokens | total_tokens | cost_usd | session_id | request_id | user_id | application | environment` using SHA-256. Records with duplicate hashes are skipped during ingestion.

### Client Record Batch

```json
{
  "client_id": "web-server-01",
  "records": [ "...array of UsageRecord..." ]
}
```

### Ingestion Result

```json
{
  "records_processed": 100,
  "records_stored": 95,
  "records_duplicate": 3,
  "records_invalid": 2,
  "processing_time_ms": 45,
  "errors": ["Invalid record at index 7", "Invalid record at index 42"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `records_processed` | integer | Total records received |
| `records_stored` | integer | Records successfully stored |
| `records_duplicate` | integer | Records skipped due to duplicate hash |
| `records_invalid` | integer | Records that failed validation |
| `processing_time_ms` | integer | Time taken to process the batch |
| `errors` | list of strings | Descriptions of any errors encountered |

### Raw File

Represents a raw JSONL file stored at ingest time, pending post-processing.

```json
{
  "ingestion_id": "uuid-for-this-upload",
  "client_id": "web-server-01",
  "status": "pending",
  "uploaded_at": "2026-02-09T09:46:00Z",
  "metadata": {
    "client_hostname": "web-server-01",
    "collected_at": "2026-02-09T09:45:00Z",
    "file_info": {
      "original_path": "/var/log/openai/usage.jsonl",
      "directory": "/var/log/openai/",
      "filename": "usage.jsonl",
      "size_bytes": 847392,
      "modified_at": "2026-02-08T09:48:00Z",
      "line_count": 1205
    }
  },
  "file_content": "<raw bytes>",
  "processing_result": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ingestion_id` | string (UUID) | Unique identifier for this upload |
| `client_id` | string | Client that uploaded this file |
| `status` | string | One of: `pending`, `processing`, `processed`, `failed` |
| `uploaded_at` | datetime | When the file was received |
| `metadata` | object | The metadata JSON from the ingest request (client_hostname, collected_at, file_info) |
| `file_content` | bytes | The raw JSONL file content |
| `processing_result` | object or null | Set after post-processing; contains record counts and errors |

**Processing result (set after post-processing):**
```json
{
  "records_processed": 1205,
  "records_stored": 1203,
  "records_duplicate": 0,
  "records_invalid": 2,
  "processing_time_ms": 145,
  "processed_at": "2026-02-09T09:50:00Z"
}
```

### Raw File Result

Returned by `StoreRawFile` at ingest time.

```json
{
  "ingestion_id": "uuid-for-this-upload",
  "status": "accepted",
  "file_size_bytes": 847392,
  "line_count": 1205
}
```

### Batch Ingestion Result

```json
{
  "total_records_processed": 500,
  "total_records_stored": 480,
  "total_records_duplicate": 12,
  "total_records_invalid": 8,
  "client_results": {
    "web-server-01": { "records_processed": 100, "records_stored": 95, "..." : "..." },
    "cloud-vm-prod": { "records_processed": 400, "records_stored": 385, "..." : "..." }
  },
  "processing_time_ms": 120
}
```

---

### Query Models

#### Usage Query

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "client_ids": ["web-server-01", "cloud-vm-prod"],
  "services": ["openai"],
  "models": ["gpt-4"],
  "applications": null,
  "environments": ["prod"],
  "session_id": null,
  "user_id": null,
  "group_by": ["service", "day"],
  "aggregates": ["sum", "count"],
  "limit": 100,
  "offset": 0,
  "order_by": [{ "field": "timestamp", "desc": true }]
}
```

**Group-By Fields:**

| Value | Description |
|-------|-------------|
| `timestamp` | Raw timestamp (no bucketing) |
| `service` | Group by service provider |
| `model` | Group by model name |
| `client_id` | Group by client |
| `application` | Group by application name |
| `environment` | Group by environment |
| `hour` | Bucket by hour |
| `day` | Bucket by day |
| `week` | Bucket by week |
| `month` | Bucket by month |

**Aggregate Functions:**

| Value | Description |
|-------|-------------|
| `sum` | Sum of values |
| `count` | Count of records |
| `avg` | Average value |
| `min` | Minimum value |
| `max` | Maximum value |

#### Usage Query Result

```json
{
  "records": [ "...array of UsageRecord..." ],
  "aggregates": { "count": 15000, "sum_cost_usd": 1247.83 },
  "total_records": 15000,
  "query_time_ms": 85
}
```

---

### Analytics Models

#### Trend Request

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "interval": "day",
  "metric": "cost",
  "client_ids": null,
  "services": ["openai"],
  "models": null
}
```

**Trend Intervals:** `hour`, `day`, `week`, `month`

**Trend Metrics:** `cost`, `total_tokens`, `input_tokens`, `output_tokens`, `request_count`

#### Trend Data (Response)

```json
{
  "data_points": [
    { "timestamp": "2026-01-01T00:00:00Z", "value": 42.50, "count": 1200 },
    { "timestamp": "2026-01-02T00:00:00Z", "value": 38.75, "count": 1050 }
  ],
  "total_value": 1247.83,
  "average_value": 40.25,
  "metric": "cost",
  "interval": "day"
}
```

#### Top Usage Request

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "group_by": "model",
  "metric": "cost",
  "limit": 10,
  "client_ids": null
}
```

#### Top Usage Result

```json
{
  "rankings": [
    { "name": "gpt-4", "value": 456.00, "percentage": 36.5, "record_count": 8500 },
    { "name": "claude-3-sonnet", "value": 298.00, "percentage": 23.9, "record_count": 12000 },
    { "name": "gpt-4o-mini", "value": 178.00, "percentage": 14.3, "record_count": 45000 }
  ],
  "total_value": 1247.83,
  "requested_top": 10
}
```

---

### Cost Analysis Models

#### Cost Breakdown Request

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "breakdown_by": ["service", "model"],
  "client_ids": null,
  "services": null,
  "models": null
}
```

#### Cost Breakdown (Response)

```json
{
  "total_cost": 1247.83,
  "breakdowns": [
    {
      "dimensions": { "service": "openai", "model": "gpt-4" },
      "cost": 456.00,
      "percentage": 36.5,
      "token_count": 2500000,
      "request_count": 8500
    },
    {
      "dimensions": { "service": "anthropic", "model": "claude-3-sonnet" },
      "cost": 298.00,
      "percentage": 23.9,
      "token_count": 4800000,
      "request_count": 12000
    }
  ],
  "currency": "USD"
}
```

#### Usage Summary Request

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "client_ids": null
}
```

#### Usage Summary (Response)

```json
{
  "period": {
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-02-01T00:00:00Z"
  },
  "total_cost": 1247.83,
  "total_tokens": 15000000,
  "total_requests": 65000,
  "service_breakdown": {
    "openai": { "service": "openai", "cost": 687.00, "tokens": 8000000, "requests": 35000, "percentage": 55.1 },
    "anthropic": { "service": "anthropic", "cost": 324.00, "tokens": 5000000, "requests": 20000, "percentage": 26.0 }
  },
  "model_breakdown": {
    "gpt-4": { "model": "gpt-4", "cost": 456.00, "tokens": 2500000, "requests": 8500, "percentage": 36.5 }
  },
  "client_breakdown": {
    "web-server-01": { "client_id": "web-server-01", "cost": 412.00, "tokens": 5200000, "requests": 22000, "percentage": 33.0 }
  },
  "daily_trend": [
    { "date": "2026-01-01", "cost": 42.50, "tokens": 500000, "requests": 2100 },
    { "date": "2026-01-02", "cost": 38.75, "tokens": 460000, "requests": 1950 }
  ],
  "cost_growth_rate": 12.5,
  "token_growth_rate": 8.3
}
```

---

### Cost Projection Models

#### Projection Request

```json
{
  "base_start_time": "2026-01-01T00:00:00Z",
  "base_end_time": "2026-02-01T00:00:00Z",
  "project_period": "monthly",
  "method": "linear",
  "client_ids": null,
  "services": null,
  "models": null
}
```

**Projection Periods:** `daily`, `weekly`, `monthly`

**Projection Methods:**

| Method | Description |
|--------|-------------|
| `linear` | Linear trend extrapolation |
| `exponential` | Exponential growth model |
| `seasonal` | Accounts for weekly/monthly patterns |
| `average` | Simple average projection |

#### Cost Projection (Response)

```json
{
  "method": "linear",
  "base_period": {
    "start_time": "2026-01-01T00:00:00Z",
    "end_time": "2026-02-01T00:00:00Z"
  },
  "projected_cost": 1450.00,
  "projected_tokens": 17500000,
  "projected_requests": 75000,
  "confidence": 0.85,
  "historical_trend": [
    { "timestamp": "2026-01-01T00:00:00Z", "value": 42.50, "count": 2100 }
  ],
  "projected_trend": [
    { "timestamp": "2026-02-01T00:00:00Z", "value": 46.80, "count": 2400 }
  ]
}
```

---

### Data Management Models

#### Retention Policy

```json
{
  "default_retention_days": 90,
  "service_retention": {
    "openai": 180,
    "anthropic": 180
  },
  "client_retention": {
    "high-volume-client": 365
  },
  "aggregate_retention_days": 730
}
```

| Field | Type | Description |
|-------|------|-------------|
| `default_retention_days` | integer | Default number of days to keep raw records |
| `service_retention` | map of string→integer | Per-service retention override (days) |
| `client_retention` | map of string→integer | Per-client retention override (days) |
| `aggregate_retention_days` | integer | How long to keep aggregated/summary data |

#### Retention Info

```json
{
  "total_records": 5000000,
  "oldest_record": "2025-06-15T00:00:00Z",
  "newest_record": "2026-02-09T09:45:00Z",
  "records_by_age": {
    "30_days": 1200000,
    "90_days": 3500000,
    "180_days": 4800000,
    "365_days": 5000000
  },
  "estimated_size_gb": 12.5
}
```

#### Retention Result

```json
{
  "records_deleted": 150000,
  "storage_freed_gb": 0.45,
  "processing_time_ms": 8500
}
```

#### Export Request

```json
{
  "start_time": "2026-01-01T00:00:00Z",
  "end_time": "2026-02-01T00:00:00Z",
  "format": "jsonl",
  "compression": "gzip",
  "client_ids": null,
  "services": null,
  "models": null,
  "destination": "/exports/usage-2026-01.jsonl.gz"
}
```

**Export Formats:** `jsonl`, `csv`, `parquet`

**Compression Options:** `none`, `gzip`, `zstd`

#### Export Result

```json
{
  "records_exported": 65000,
  "file_size_bytes": 45000000,
  "file_path": "/exports/usage-2026-01.jsonl.gz",
  "processing_time_ms": 12000
}
```

#### Storage Health

```json
{
  "status": "healthy",
  "message": "PostgreSQL connected, 5M records",
  "checked_at": "2026-02-09T09:45:00Z"
}
```

#### Storage Stats

```json
{
  "total_records": 5000000,
  "total_size_gb": 12.5,
  "records_today": 15000
}
```

#### Optimization Result

```json
{
  "status": "ok",
  "processing_time_ms": 45000
}
```

---

## Storage Implementation Guidelines

### 1. In-Memory Storage (Development/Testing)

**Purpose:** Development, testing, and prototyping. Not suitable for production.

**Behavioral Description:**
1. Store all records in an in-memory list
2. Maintain a hash set for deduplication
3. Use read-write locking for thread safety
4. Support all query operations via in-memory filtering and aggregation

**Ingestion Behavior:**
1. For each incoming record:
   a. Set `client_id` to the provided client identifier
   b. Set `ingested_at` to current UTC time
   c. Compute `record_hash` using SHA-256 of key fields (see deduplication hash above)
   d. Validate: timestamp must not be default, service and model must not be empty
   e. Check hash against stored hashes — skip if duplicate
   f. Store record and add hash to set
2. Return counts of processed, stored, duplicate, and invalid records

**Query Behavior:**
1. Filter records matching all specified criteria (time range, client IDs, services, models, etc.)
2. Apply pagination (offset and limit)
3. Calculate requested aggregates on matching records
4. Return results with total count and query time

### 2. PostgreSQL Storage (Production — Relational)

**Purpose:** Production use with moderate to high volume. Good balance of query flexibility and write performance.

**Behavioral Description:**
1. Initialize by creating the table and indexes if they don't exist
2. Use transactions for batch inserts
3. Handle deduplication via unique constraint on `record_hash` (`ON CONFLICT DO NOTHING`)
4. Use batch deletes for retention (configurable batch size with small delays between batches to reduce load)
5. Run VACUUM ANALYZE after retention cleanup to reclaim space

**Batch Ingestion:**
- Process client batches in parallel with bounded concurrency (e.g., max 10 concurrent batches)
- Each batch runs in its own transaction
- Aggregate per-client results into the batch result

#### PostgreSQL Schema

```sql
CREATE TABLE IF NOT EXISTS token_usage (
    id BIGSERIAL PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    service VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,

    input_tokens BIGINT,
    output_tokens BIGINT,
    total_tokens BIGINT,

    cost_usd DECIMAL(12,6),
    cost_model VARCHAR(50),

    session_id VARCHAR(255),
    request_id VARCHAR(255),
    user_id VARCHAR(255),

    application VARCHAR(100),
    environment VARCHAR(50),

    metadata JSONB,

    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    record_hash VARCHAR(64) NOT NULL,

    CONSTRAINT unique_record_hash UNIQUE (record_hash)
);

-- Indexes optimized for time-series queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_timestamp
    ON token_usage (timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_client_timestamp
    ON token_usage (client_id, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_service_timestamp
    ON token_usage (service, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_model_timestamp
    ON token_usage (model, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_cost
    ON token_usage (cost_usd) WHERE cost_usd IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_hash
    ON token_usage (record_hash);

-- Partial indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_usage_recent
    ON token_usage (timestamp DESC)
    WHERE timestamp > NOW() - INTERVAL '30 days';
```

#### Partitioning Strategy

```sql
-- Partition by month for better query performance and retention management
CREATE TABLE token_usage_y2026m02 PARTITION OF token_usage
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE token_usage_y2026m03 PARTITION OF token_usage
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Automatic partition creation (run monthly via scheduled job)
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE + INTERVAL '1 month');
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'token_usage_y' || EXTRACT(year FROM start_date) ||
                     'm' || LPAD(EXTRACT(month FROM start_date)::text, 2, '0');

    EXECUTE format('CREATE TABLE %I PARTITION OF token_usage
                    FOR VALUES FROM (%L) TO (%L)',
                   partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

### 3. InfluxDB Storage (Production — Time-Series Optimized)

**Purpose:** High-volume production use where time-series queries and aggregation dominate. Excellent write throughput and built-in downsampling.

**Behavioral Description:**
1. Initialize by connecting with URL, token, org, and bucket parameters
2. Map usage records to time-series points:
   - **Measurement:** `token_usage`
   - **Tags** (indexed, low-cardinality): `client_id`, `service`, `model`, `application`, `environment`
   - **Fields** (values): `input_tokens`, `output_tokens`, `total_tokens`, `cost_usd`
   - **Timestamp:** record timestamp with millisecond precision
3. Batch-write points for efficiency (configurable batch size and flush interval)
4. For trend queries, use native windowed aggregation (e.g., Flux `aggregateWindow`)
5. Deduplication handled via InfluxDB's natural overwrite behavior (same measurement + tags + timestamp = overwrite)

**Advantages over relational storage:**
- Native time-series indexing and compression
- Built-in downsampling and retention policies
- Optimized for high write throughput
- Efficient windowed aggregation queries

**Limitations:**
- Less flexible ad-hoc querying than SQL
- Not ideal for non-time-series analytics
- Tag cardinality must be managed carefully

---

## Performance Optimization

### Indexing Strategies

#### Time-Series Indexes (PostgreSQL)
```sql
-- Primary time-based index (most important)
CREATE INDEX idx_token_usage_time_desc ON token_usage (timestamp DESC);

-- Composite indexes for common query patterns
CREATE INDEX idx_client_time ON token_usage (client_id, timestamp DESC);
CREATE INDEX idx_service_time ON token_usage (service, timestamp DESC);
CREATE INDEX idx_model_time ON token_usage (model, timestamp DESC);

-- Cost analysis indexes
CREATE INDEX idx_cost_time ON token_usage (cost_usd, timestamp DESC)
    WHERE cost_usd IS NOT NULL;

-- Partial indexes for recent data (most queried)
CREATE INDEX idx_recent_data ON token_usage (timestamp DESC, service, model)
    WHERE timestamp > NOW() - INTERVAL '7 days';
```

### Batch Processing Optimization

**Strategy for high-throughput ingestion:**

1. Process client batches in parallel with bounded concurrency (e.g., semaphore with max 10)
2. Each batch opens its own database connection/transaction
3. Use bulk insert statements rather than individual inserts where the backend supports it
4. Aggregate per-client results into the overall batch result
5. Report total processing time

### Retention Cleanup Strategy

**Batched deletion to avoid long-running transactions:**

1. Calculate cutoff date from retention policy
2. Delete records in batches (e.g., 10,000 at a time) ordered by timestamp
3. Between batches, introduce a small delay (e.g., 100ms) to reduce database load
4. Continue until fewer records than batch size are deleted (no more records to clean)
5. After deletion completes, run storage-specific maintenance (e.g., `VACUUM ANALYZE` for PostgreSQL)
6. Return count of deleted records, freed storage, and processing time

---

## Data Retention and Cleanup

### Retention Policy Behavior

1. **Default retention** applies to all records not covered by a specific override
2. **Per-service retention** overrides the default for records from a specific AI service
3. **Per-client retention** overrides the default for records from a specific client
4. **Aggregate retention** controls how long aggregated/summary data is kept (typically longer than raw records)
5. When multiple overrides apply (e.g., both service and client), the longest retention wins

### Retention Execution

- Retention cleanup should be run on a schedule (e.g., daily) or triggered manually via the admin interface
- Cleanup is idempotent and safe to run concurrently with ingestion
- Large deletions are batched to avoid locking or performance impact on concurrent queries

---

## Testing Strategy

### Performance Tests

| Test Scenario | Description | Success Criteria |
|---------------|-------------|-----------------|
| Ingestion throughput | Store 1,000 records in a single batch | Completes in < 2 seconds |
| Large dataset query | Query across 100,000 records with grouping | Completes in < 1 second |
| Batch ingestion | Store 100 batches of 1,000 records (100K total) | All records stored, no errors |
| Concurrent ingestion | 10 parallel clients each ingesting 1,000 records | No data loss, no deadlocks |
| Trend query | Aggregate 30-day daily trend across 1M records | Returns correct data points in < 2 seconds |

### Data Validation Tests

| Test Scenario | Input | Expected Outcome |
|---------------|-------|-----------------|
| Valid record | Complete record with timestamp, service, model | Stored successfully (records_stored = 1) |
| Missing timestamp | Record with default/zero timestamp | Rejected as invalid (records_invalid = 1) |
| Empty service | Record with empty string service | Rejected as invalid (records_invalid = 1) |
| Empty model | Record with empty string model | Rejected as invalid (records_invalid = 1) |
| Duplicate record | Same record submitted twice | First stored, second detected as duplicate |
| Mixed batch | 5 valid, 2 invalid, 1 duplicate | 5 stored, 2 invalid, 1 duplicate |
| Optional fields null | Record with only required fields | Stored successfully |

### Analytics Tests

| Test Scenario | Description | Validation |
|---------------|-------------|------------|
| Cost breakdown accuracy | Store known records, query breakdown | Costs, percentages, and counts match expected values |
| Trend data consistency | Store 30 days of known data, query daily trend | Each data point matches expected daily sum |
| Top usage ranking | Store records for 5 services, query top 3 | Top 3 returned in correct order with correct percentages |
| Usage summary totals | Store known records, get summary | Total cost, tokens, requests match; growth rates computed correctly |
| Projection method | Store linear trend data, project next period | Projected cost within reasonable confidence bounds |

### Retention Tests

| Test Scenario | Description | Validation |
|---------------|-------------|------------|
| Default retention | Apply 90-day policy to 180-day dataset | Records older than 90 days deleted |
| Per-service retention | Service A: 30 days, Service B: 180 days | Only Service A records older than 30 days deleted |
| Retention idempotency | Run retention twice | Second run deletes 0 records |
| Concurrent retention | Run retention during active ingestion | No errors, no data corruption |

---

## Configuration Examples

### In-Memory Plugin Configuration
```json
{
  "type": "memory",
  "max_records": 1000000,
  "enable_persistence": false,
  "performance": {
    "batch_size": 1000,
    "concurrent_queries": 10
  }
}
```

### PostgreSQL Plugin Configuration
```json
{
  "type": "postgresql",
  "connection_string": "Host=localhost;Port=5432;Database=tokenly;Username=user;Password=pass",
  "table_name": "token_usage",
  "pool_size": 20,
  "batch_size": 1000,
  "partition_strategy": "monthly",
  "indexes": {
    "create_on_startup": true,
    "maintenance_schedule": "weekly"
  }
}
```

### InfluxDB Plugin Configuration
```json
{
  "type": "influxdb",
  "url": "http://localhost:8086",
  "token": "your-influxdb-token",
  "org": "tokenly",
  "bucket": "token_usage",
  "measurement": "usage_records",
  "batch_size": 5000,
  "flush_interval": "10s"
}
```

---

This specification provides a comprehensive foundation for implementing high-performance token usage storage that can scale from development (in-memory) to production (PostgreSQL, InfluxDB) while supporting the analytics and reporting needs of the Tokenly system.
