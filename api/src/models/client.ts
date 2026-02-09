// Client models

import type { ClientId } from './branded.js';

export type ClientStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type WorkerStatus = 'running' | 'pending' | 'stopped' | 'crashed';

export interface SystemInfo {
  readonly os: string;
  readonly arch: string;
  readonly platform: string;
  readonly version?: string;
  readonly uptime_seconds?: number;
}

export interface ClientStats {
  total_uploads: number;
  total_records: number;
  last_upload: string | null;
  files_uploaded_today: number;
  last_scan_time: string | null;
  directories_monitored: number;
  errors_today: number;
  consecutive_failures: number;
}

export interface ClientInfo {
  readonly client_id: ClientId;
  readonly hostname: string;
  status: ClientStatus;
  readonly created_at: string;
  updated_at: string;
  last_seen: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  launcher_version: string | null;
  worker_version: string | null;
  worker_status: WorkerStatus | null;
  system_info: SystemInfo | null;
  stats: ClientStats;
  custom_config: Record<string, unknown>;
}

export interface ClientRegistration {
  readonly hostname: string;
  readonly launcher_version?: string;
  readonly worker_version?: string;
  readonly system_info?: SystemInfo;
  readonly registration_source?: string;
}

export interface ClientFilter {
  readonly status?: ClientStatus[];
  readonly hostname?: string;
  readonly last_seen_after?: string | null;
  readonly last_seen_before?: string | null;
  readonly created_after?: string | null;
  readonly created_before?: string | null;
  readonly limit?: number;
  readonly offset?: number;
  readonly order_by?: string;
  readonly order_desc?: boolean;
}

export interface ClientList {
  readonly clients: readonly ClientInfo[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ClientConfig {
  scan_enabled: boolean;
  scan_interval_minutes: number;
  max_file_age_hours: number;
  max_file_size_mb: number;
  worker_timeout_seconds: number;
  max_concurrent_uploads: number;
  discovery_paths: {
    linux: string[];
    windows: string[];
    darwin: string[];
  };
  file_patterns: string[];
  exclude_patterns: string[];
  heartbeat_interval_seconds: number;
  retry_failed_uploads: boolean;
  retry_delay_seconds: number;
  log_level: string;
  update_enabled: boolean;
  update_check_interval_hours: number;
}

export interface ClientConfigOverride {
  readonly client_id: ClientId;
  overrides: Record<string, unknown>;
  readonly created_at: string;
  updated_at: string;
  updated_by: string;
  notes?: string;
}
