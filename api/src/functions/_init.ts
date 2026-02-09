import { createServices, getServices, ServiceContainer } from '../services/index.js';

let initialized = false;

export async function ensureInitialized(): Promise<ServiceContainer> {
  if (!initialized) {
    await createServices();
    initialized = true;
  }
  return getServices();
}
