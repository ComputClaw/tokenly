// System and client stats models

import type { ClientId } from './branded.js';
import type { ClientStatus } from './client.js';

export interface SystemStats {
  readonly version: string;
  readonly uptime_seconds: number;
  readonly memory_usage_mb: number;
  readonly cpu_usage_percent: number;
  readonly storage: {
    readonly backend: string;
    readonly status: string;
    readonly total_records: number;
    readonly total_size_mb: number;
  };
  readonly clients: {
    readonly total: number;
    readonly active: number;
    readonly pending: number;
  };
  readonly ingestion: {
    readonly files_today: number;
    readonly records_today: number;
    readonly average_processing_time_ms: number;
    readonly errors_today: number;
  };
}

export interface ClientStatsDetail {
  readonly client_id: ClientId;
  readonly hostname: string;
  readonly status: ClientStatus;
  readonly total_uploads: number;
  readonly total_records: number;
  readonly last_upload: string | null;
  readonly last_seen: string | null;
}
