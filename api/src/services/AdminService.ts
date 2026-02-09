import { IAdminStoragePlugin } from '../interfaces/IAdminStoragePlugin.js';
import {
  User, UserCreate, UserUpdate,
  ClientInfo, ClientFilter, ClientList,
  ClientConfig, ClientConfigOverride,
  ConfigValue,
  AuditAction, AuditFilter, AuditActionType, AuditResourceType,
  SystemStats, ClientStatsDetail,
} from '../models/index.js';

export class AdminService {
  constructor(private readonly storage: IAdminStoragePlugin) {}

  // --- Users ---

  async createUser(input: UserCreate, actorUsername: string, ipAddress?: string): Promise<User> {
    const user = await this.storage.createUser(input);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'user_create',
      resource: 'user',
      resource_id: user.user_id,
      details: { username: input.username, role: input.role },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
    return user;
  }

  async getUser(username: string): Promise<User | null> {
    return this.storage.getUser(username);
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.storage.getUserById(userId);
  }

  async listUsers(): Promise<User[]> {
    return this.storage.listUsers();
  }

  async updateUser(username: string, updates: UserUpdate, actorUsername: string, ipAddress?: string): Promise<void> {
    await this.storage.updateUser(username, updates);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'user_edit',
      resource: 'user',
      resource_id: username,
      details: { updates },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async changePassword(username: string, passwordHash: string, actorUsername: string, ipAddress?: string): Promise<void> {
    await this.storage.setUserPassword(username, passwordHash, actorUsername);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'password_change',
      resource: 'user',
      resource_id: username,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async disableUser(username: string, actorUsername: string, ipAddress?: string): Promise<void> {
    await this.storage.disableUser(username, actorUsername);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'user_disable',
      resource: 'user',
      resource_id: username,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async enableUser(username: string, actorUsername: string, ipAddress?: string): Promise<void> {
    await this.storage.enableUser(username, actorUsername);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'user_enable',
      resource: 'user',
      resource_id: username,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async deleteUser(username: string, actorUsername: string, ipAddress?: string): Promise<void> {
    await this.storage.deleteUser(username, actorUsername);
    await this.storage.logAdminAction({
      user_id: actorUsername,
      action: 'user_delete',
      resource: 'user',
      resource_id: username,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async validatePassword(username: string, password: string): Promise<User | null> {
    return this.storage.validatePassword(username, password);
  }

  // --- Client Management ---

  async approveClient(clientId: string, approvedBy: string, notes?: string, ipAddress?: string): Promise<void> {
    await this.storage.setClientStatus(clientId, 'approved', approvedBy, notes);
    await this.storage.logAdminAction({
      user_id: approvedBy,
      action: 'client_approve',
      resource: 'client',
      resource_id: clientId,
      details: { notes: notes ?? null },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async rejectClient(clientId: string, rejectedBy: string, notes?: string, ipAddress?: string): Promise<void> {
    await this.storage.setClientStatus(clientId, 'rejected', rejectedBy, notes);
    await this.storage.logAdminAction({
      user_id: rejectedBy,
      action: 'client_reject',
      resource: 'client',
      resource_id: clientId,
      details: { notes: notes ?? null },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async suspendClient(clientId: string, suspendedBy: string, notes?: string, ipAddress?: string): Promise<void> {
    await this.storage.setClientStatus(clientId, 'suspended', suspendedBy, notes);
    await this.storage.logAdminAction({
      user_id: suspendedBy,
      action: 'client_suspend',
      resource: 'client',
      resource_id: clientId,
      details: { notes: notes ?? null },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async deleteClient(clientId: string, deletedBy: string, ipAddress?: string): Promise<void> {
    await this.storage.deleteClient(clientId);
    await this.storage.logAdminAction({
      user_id: deletedBy,
      action: 'client_delete',
      resource: 'client',
      resource_id: clientId,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async getClient(clientId: string): Promise<ClientInfo | null> {
    return this.storage.getClient(clientId);
  }

  async listClients(filter: ClientFilter): Promise<ClientList> {
    return this.storage.listClients(filter);
  }

  async getPendingClients(): Promise<ClientInfo[]> {
    return this.storage.getPendingClients();
  }

  async getClientSummary(): Promise<{ approved: number; pending: number; rejected: number; active: number }> {
    const all = await this.storage.listClients({ limit: 10000 });
    return {
      approved: all.clients.filter(c => c.status === 'approved').length,
      pending: all.clients.filter(c => c.status === 'pending').length,
      rejected: all.clients.filter(c => c.status === 'rejected').length,
      active: all.clients.filter(c => {
        if (c.status !== 'approved' || !c.last_seen) return false;
        return Date.now() - new Date(c.last_seen).getTime() < 24 * 60 * 60 * 1000;
      }).length,
    };
  }

  // --- Configuration ---

  async getConfig(key: string): Promise<ConfigValue | null> {
    return this.storage.getConfig(key);
  }

  async setConfig(key: string, value: unknown, updatedBy: string, ipAddress?: string): Promise<void> {
    await this.storage.setConfig(key, value, updatedBy);
    await this.storage.logAdminAction({
      user_id: updatedBy,
      action: 'config_set',
      resource: 'config',
      resource_id: key,
      details: { value },
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async listConfig(prefix: string): Promise<ConfigValue[]> {
    return this.storage.listConfig(prefix);
  }

  async deleteConfig(key: string, deletedBy: string, ipAddress?: string): Promise<void> {
    await this.storage.deleteConfig(key, deletedBy);
    await this.storage.logAdminAction({
      user_id: deletedBy,
      action: 'config_delete',
      resource: 'config',
      resource_id: key,
      details: {},
      ip_address: ipAddress ?? null,
      user_agent: null,
    });
  }

  async getDefaultClientConfig(): Promise<ClientConfig> {
    return this.storage.getDefaultClientConfig();
  }

  async setDefaultClientConfig(config: ClientConfig, updatedBy: string): Promise<void> {
    return this.storage.setDefaultClientConfig(config, updatedBy);
  }

  async getClientConfig(clientId: string): Promise<ClientConfig | null> {
    return this.storage.getClientConfig(clientId);
  }

  async setClientConfigOverride(clientId: string, overrides: Record<string, unknown>, updatedBy: string): Promise<void> {
    return this.storage.setClientConfigOverride(clientId, overrides, updatedBy);
  }

  async removeClientConfigOverride(clientId: string, updatedBy: string): Promise<void> {
    return this.storage.removeClientConfigOverride(clientId, updatedBy);
  }

  async listClientConfigOverrides(): Promise<ClientConfigOverride[]> {
    return this.storage.listClientConfigOverrides();
  }

  // --- Audit ---

  async logAction(
    action: AuditActionType,
    resource: AuditResourceType,
    userId: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.storage.logAdminAction({
      user_id: userId,
      action,
      resource,
      resource_id: resourceId ?? null,
      details: details ?? null,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    });
  }

  async getAuditLog(filter: AuditFilter): Promise<{ entries: AuditAction[]; total: number }> {
    return this.storage.getAuditLog(filter);
  }

  // --- Stats ---

  async getSystemStats(): Promise<SystemStats> {
    return this.storage.getSystemStats();
  }

  async getClientStats(clientId: string): Promise<ClientStatsDetail | null> {
    return this.storage.getClientStats(clientId);
  }
}
