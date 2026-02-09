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

export interface User {
  user_id: string;
  username: string;
  role: string;
  permissions: string[];
  enabled: boolean;
  created_at: string;
  last_login: string;
  must_change_password: boolean;
}

export interface UserListResponse {
  users: User[];
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
  period: {
    start_time: string;
    end_time: string;
  };
  total_cost: number;
  total_tokens: number;
  total_requests: number;
  service_breakdown: Record<string, { service: string; cost: number; tokens: number; requests: number }>;
  model_breakdown: Record<string, { model: string; cost: number; tokens: number; requests: number }>;
  client_breakdown: Record<string, { client_id: string; hostname: string; cost: number; tokens: number; requests: number }>;
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

export interface ConfigEntry {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string;
}
