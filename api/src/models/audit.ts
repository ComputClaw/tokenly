// Audit trail models

import type { AuditId } from './branded.js';

export type AuditActionType =
  | 'client_approve'
  | 'client_reject'
  | 'client_suspend'
  | 'client_delete'
  | 'config_set'
  | 'config_delete'
  | 'user_create'
  | 'user_edit'
  | 'user_disable'
  | 'user_enable'
  | 'user_delete'
  | 'password_change'
  | 'admin_login'
  | 'admin_logout'
  | 'admin_login_failed';

export type AuditResourceType = 'user' | 'client' | 'config' | 'system';

export interface AuditAction {
  readonly id: AuditId;
  readonly timestamp: string;
  readonly user_id: string;
  readonly action: AuditActionType;
  readonly resource: AuditResourceType;
  readonly resource_id: string | null;
  readonly details: Record<string, unknown> | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
}

export interface AuditFilter {
  readonly user_id?: string;
  readonly actions?: AuditActionType[];
  readonly resources?: AuditResourceType[];
  readonly resource_id?: string | null;
  readonly timestamp_after?: string | null;
  readonly timestamp_before?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}
