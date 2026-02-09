import {
  User, UserCreate, UserUpdate,
  ClientInfo, ClientRegistration, ClientFilter, ClientList, ClientStatus,
  ClientConfig, ClientConfigOverride,
  ConfigValue,
  AuditAction, AuditFilter,
  SystemStats, ClientStatsDetail,
} from '../models/index.js';

export interface IAdminStoragePlugin {
  // Lifecycle
  initialize(config: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<void>;
  close(): Promise<void>;

  // Users
  createUser(input: UserCreate): Promise<User>;
  getUser(username: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  updateUser(username: string, updates: UserUpdate): Promise<void>;
  setUserPassword(username: string, passwordHash: string, updatedBy: string): Promise<void>;
  disableUser(username: string, disabledBy: string): Promise<void>;
  enableUser(username: string, enabledBy: string): Promise<void>;
  deleteUser(username: string, deletedBy: string): Promise<void>;
  validatePassword(username: string, password: string): Promise<User | null>;

  // Client Management
  registerClient(registration: ClientRegistration): Promise<ClientInfo>;
  getClient(clientId: string): Promise<ClientInfo | null>;
  getClientByHostname(hostname: string): Promise<ClientInfo | null>;
  updateClient(clientId: string, updates: Partial<ClientInfo>): Promise<void>;
  listClients(filter: ClientFilter): Promise<ClientList>;
  deleteClient(clientId: string): Promise<void>;
  setClientStatus(clientId: string, status: ClientStatus, approvedBy: string, notes?: string): Promise<void>;
  getPendingClients(): Promise<ClientInfo[]>;

  // Configuration
  getConfig(key: string): Promise<ConfigValue | null>;
  setConfig(key: string, value: unknown, updatedBy: string): Promise<void>;
  listConfig(prefix: string): Promise<ConfigValue[]>;
  deleteConfig(key: string, deletedBy: string): Promise<void>;
  getDefaultClientConfig(): Promise<ClientConfig>;
  setDefaultClientConfig(config: ClientConfig, updatedBy: string): Promise<void>;

  // Per-Client Config Overrides
  getClientConfig(clientId: string): Promise<ClientConfig | null>;
  setClientConfigOverride(clientId: string, overrides: Record<string, unknown>, updatedBy: string): Promise<void>;
  removeClientConfigOverride(clientId: string, updatedBy: string): Promise<void>;
  listClientConfigOverrides(): Promise<ClientConfigOverride[]>;

  // Audit
  logAdminAction(action: Omit<AuditAction, 'id' | 'timestamp'>): Promise<void>;
  getAuditLog(filter: AuditFilter): Promise<{ entries: AuditAction[]; total: number }>;

  // Stats
  getSystemStats(): Promise<SystemStats>;
  getClientStats(clientId: string): Promise<ClientStatsDetail | null>;
}
