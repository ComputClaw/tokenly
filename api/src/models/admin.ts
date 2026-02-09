// User models

import type { UserId } from './branded.js';

export type AdminRole = 'super_admin' | 'client_manager' | 'viewer' | 'custom';

export type Permission =
  | 'client:approve'
  | 'client:reject'
  | 'client:delete'
  | 'client:configure'
  | 'config:read'
  | 'config:write'
  | 'config:delete'
  | 'user:create'
  | 'user:edit'
  | 'user:delete'
  | 'audit:read'
  | 'system:manage';

export const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: [
    'client:approve', 'client:reject', 'client:delete', 'client:configure',
    'config:read', 'config:write', 'config:delete',
    'user:create', 'user:edit', 'user:delete',
    'audit:read', 'system:manage',
  ],
  client_manager: [
    'client:approve', 'client:reject', 'client:configure',
    'config:read', 'audit:read',
  ],
  viewer: [
    'config:read', 'audit:read',
  ],
} as const satisfies Record<string, readonly Permission[]>;

export interface User {
  readonly user_id: UserId;
  readonly username: string;
  password_hash: string;
  role: AdminRole;
  permissions: Permission[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
  readonly created_by: string;
  disabled_at: string | null;
  disabled_by: string;
  failed_attempts: number;
  locked_until: string | null;
  must_change_password: boolean;
}

// Public-facing user type that never exposes the password hash
export type PublicUser = Omit<User, 'password_hash'>;

export interface UserCreate {
  readonly username: string;
  readonly password: string;
  readonly role: AdminRole;
  readonly custom_permissions?: Permission[] | null;
  readonly created_by: string;
}

export interface UserUpdate {
  readonly role?: AdminRole;
  readonly custom_permissions?: Permission[] | null;
  readonly must_change_password?: boolean;
  readonly last_login?: string;
  readonly updated_by: string;
}
