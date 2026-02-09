// Branded types for type-safe identifiers

declare const ClientIdBrand: unique symbol;
export type ClientId = string & { readonly [ClientIdBrand]: true };

declare const UserIdBrand: unique symbol;
export type UserId = string & { readonly [UserIdBrand]: true };

declare const AuditIdBrand: unique symbol;
export type AuditId = string & { readonly [AuditIdBrand]: true };

// Factory functions to create branded IDs from validated strings
export function toClientId(id: string): ClientId {
  return id as ClientId;
}

export function toUserId(id: string): UserId {
  return id as UserId;
}

export function toAuditId(id: string): AuditId {
  return id as AuditId;
}
