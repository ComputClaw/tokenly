import { IAdminStoragePlugin } from '../interfaces/IAdminStoragePlugin.js';
import { ITokenStoragePlugin } from '../interfaces/ITokenStoragePlugin.js';
import { InMemoryAdminStorage } from '../plugins/InMemoryAdminStorage.js';
import { AzureTableAdminStorage } from '../plugins/AzureTableAdminStorage.js';
import { InMemoryTokenStorage } from '../plugins/InMemoryTokenStorage.js';
import { AdminService } from './AdminService.js';
import { ClientService } from './ClientService.js';
import { JwtTokenService } from './JwtTokenService.js';
import { JwtValidationService } from './JwtValidationService.js';
import { RefreshTokenStore } from './RefreshTokenStore.js';

export interface ServiceContainer {
  adminStorage: IAdminStoragePlugin;
  tokenStorage: ITokenStoragePlugin;
  adminService: AdminService;
  clientService: ClientService;
  jwtTokenService: JwtTokenService;
  jwtValidationService: JwtValidationService;
  refreshTokenStore: RefreshTokenStore;
}

let container: ServiceContainer | null = null;

export async function createServices(): Promise<ServiceContainer> {
  if (container) return container;

  // Create storage plugins
  const adminBackend = process.env['ADMIN_STORAGE_BACKEND'] ?? 'memory';
  const adminStorage: IAdminStoragePlugin = adminBackend === 'azure_table'
    ? new AzureTableAdminStorage()
    : new InMemoryAdminStorage();
  const tokenStorage = new InMemoryTokenStorage();

  // Initialize storage
  await adminStorage.initialize({});
  await tokenStorage.initialize({});

  // Create services
  const adminService = new AdminService(adminStorage);
  const clientService = new ClientService(adminStorage, tokenStorage);
  const jwtTokenService = new JwtTokenService();
  const jwtValidationService = new JwtValidationService();
  const refreshTokenStore = new RefreshTokenStore();

  container = {
    adminStorage,
    tokenStorage,
    adminService,
    clientService,
    jwtTokenService,
    jwtValidationService,
    refreshTokenStore,
  };

  return container;
}

export function getServices(): ServiceContainer {
  if (!container) {
    throw new Error('Services not initialized. Call createServices() first.');
  }
  return container;
}
