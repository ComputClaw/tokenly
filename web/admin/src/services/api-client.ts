import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type {
  LoginResponse,
  RefreshResponse,
  ClientListResponse,
  AdminUserListResponse,
  SystemStatus,
  AuditLogResponse,
  AnalyticsSummary,
  TrendDataPoint,
  TopUsageEntry,
  CostBreakdownEntry,
  ConfigEntry,
} from '../types/api.ts';
import {
  LoginResponseSchema,
  ClientListResponseSchema,
  SystemStatusSchema,
} from '../types/schemas.ts';

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
const retriedRequests = new WeakSet<InternalAxiosRequestConfig>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest: InternalAxiosRequestConfig | undefined = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !retriedRequests.has(originalRequest)
    ) {
      retriedRequests.add(originalRequest);
      try {
        const token = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch {
        accessToken = null;
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = api
    .post<RefreshResponse>('/auth/refresh')
    .then((res) => {
      accessToken = res.data.access_token;
      return res.data.access_token;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

// Auth
export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', { username, password });
  const validated = LoginResponseSchema.parse(res.data);
  accessToken = validated.access_token;
  return validated;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
  accessToken = null;
}

export async function refresh(): Promise<RefreshResponse> {
  const res = await api.post<RefreshResponse>('/auth/refresh');
  accessToken = res.data.access_token;
  return res.data;
}

// Clients
export async function getClients(status?: string): Promise<ClientListResponse> {
  const res = await api.get<ClientListResponse>('/admin/clients', {
    params: status ? { status } : undefined,
  });
  return ClientListResponseSchema.parse(res.data);
}

export async function approveClient(clientId: string, notes?: string): Promise<void> {
  await api.put(`/admin/clients/${clientId}/approve`, { approved: true, notes });
}

export async function rejectClient(clientId: string): Promise<void> {
  await api.put(`/admin/clients/${clientId}/reject`, { approved: false });
}

export async function deleteClient(clientId: string): Promise<void> {
  await api.delete(`/admin/clients/${clientId}`);
}

// Users
export async function getUsers(): Promise<AdminUserListResponse> {
  const res = await api.get<AdminUserListResponse>('/admin/users');
  return res.data;
}

export async function createUser(username: string, password: string, role: string): Promise<void> {
  await api.post('/admin/users', { username, password, role });
}

export async function disableUser(username: string): Promise<void> {
  await api.put(`/admin/users/${username}/disable`);
}

export async function enableUser(username: string): Promise<void> {
  await api.put(`/admin/users/${username}/enable`);
}

export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.put(`/admin/users/${username}/password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// System Status
export async function getStatus(): Promise<SystemStatus> {
  const res = await api.get<SystemStatus>('/admin/status');
  return SystemStatusSchema.parse(res.data);
}

// Config
export async function getConfig(key: string): Promise<ConfigEntry> {
  const res = await api.get<ConfigEntry>(`/admin/config/${key}`);
  return res.data;
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  await api.put(`/admin/config/${key}`, { value });
}

// Audit
export async function getAuditLog(params?: {
  page?: number;
  page_size?: number;
  user?: string;
  action?: string;
}): Promise<AuditLogResponse> {
  const res = await api.get<AuditLogResponse>('/admin/audit', { params });
  return res.data;
}

// Analytics
export async function getAnalyticsSummary(period?: string): Promise<AnalyticsSummary> {
  const res = await api.get<AnalyticsSummary>('/admin/analytics/summary', {
    params: period ? { period } : undefined,
  });
  return res.data;
}

export async function getTrend(period?: string): Promise<TrendDataPoint[]> {
  const res = await api.get<TrendDataPoint[]>('/admin/analytics/trend', {
    params: period ? { period } : undefined,
  });
  return res.data;
}

export async function getTopUsage(
  groupBy: string,
  period?: string,
): Promise<TopUsageEntry[]> {
  const res = await api.get<TopUsageEntry[]>('/admin/analytics/top', {
    params: { group_by: groupBy, ...(period ? { period } : {}) },
  });
  return res.data;
}

export async function getCostBreakdown(period?: string): Promise<CostBreakdownEntry[]> {
  const res = await api.get<CostBreakdownEntry[]>('/admin/analytics/costs', {
    params: period ? { period } : undefined,
  });
  return res.data;
}
