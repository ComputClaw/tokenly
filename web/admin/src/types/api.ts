export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface AuthUser {
  username: string;
  permissions: string[];
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Client {
  client_id: string;
  hostname: string;
  status: 'approved' | 'pending' | 'rejected';
  last_seen: string;
  launcher_version: string;
  worker_version: string;
  worker_status: string;
  system_info: {
    os: string;
    platform: string;
  };
  stats: {
    total_uploads: number;
    total_records: number;
    last_upload: string;
  };
  approved_at?: string | undefined;
  approved_by?: string | undefined;
}

export interface ClientListResponse {
  clients: Client[];
  total: number;
  summary: {
    approved: number;
    pending: number;
    rejected: number;
    active: number;
  };
}

export interface AdminUser {
  user_id: string;
  username: string;
  role: string;
  permissions: string[];
  enabled: boolean;
  created_at: string;
  last_login: string;
  must_change_password: boolean;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
}

export interface SystemStatus {
  server: {
    version: string;
    uptime_seconds: number;
    memory_usage_mb: number;
    cpu_usage_percent: number;
  };
  storage: {
    backend: string;
    status: string;
    total_records: number;
    total_size_mb: number;
  };
  clients: {
    total: number;
    active: number;
    pending: number;
  };
  ingestion: {
    files_today: number;
    records_today: number;
    average_processing_time_ms: number;
    errors_today: number;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnalyticsSummary {
  total_cost: number;
  total_tokens: number;
  total_requests: number;
  period_start: string;
  period_end: string;
}

export interface TrendDataPoint {
  date: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface TopUsageEntry {
  name: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface CostBreakdownEntry {
  service: string;
  model: string;
  cost: number;
  tokens: number;
  requests: number;
}

export interface ConfigEntry {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string;
}
