import { z } from 'zod';

export const AuthUserSchema = z.object({
  username: z.string(),
  permissions: z.array(z.string()),
});

export const ClientSchema = z.object({
  client_id: z.string(),
  hostname: z.string(),
  status: z.enum(['approved', 'pending', 'rejected']),
  last_seen: z.string(),
  launcher_version: z.string(),
  worker_version: z.string(),
  worker_status: z.string(),
  system_info: z.object({
    os: z.string(),
    platform: z.string(),
  }),
  stats: z.object({
    total_uploads: z.number(),
    total_records: z.number(),
    last_upload: z.string(),
  }),
  approved_at: z.string().optional(),
  approved_by: z.string().optional(),
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  user: AuthUserSchema,
});

export const ClientListResponseSchema = z.object({
  clients: z.array(ClientSchema),
  total: z.number(),
  summary: z.object({
    approved: z.number(),
    pending: z.number(),
    rejected: z.number(),
    active: z.number(),
  }),
});

export const SystemStatusSchema = z.object({
  server: z.object({
    version: z.string(),
    uptime_seconds: z.number(),
    memory_usage_mb: z.number(),
    cpu_usage_percent: z.number(),
  }),
  storage: z.object({
    backend: z.string(),
    status: z.string(),
    total_records: z.number(),
    total_size_mb: z.number(),
  }),
  clients: z.object({
    total: z.number(),
    active: z.number(),
    pending: z.number(),
  }),
  ingestion: z.object({
    files_today: z.number(),
    records_today: z.number(),
    average_processing_time_ms: z.number(),
    errors_today: z.number(),
  }),
});
