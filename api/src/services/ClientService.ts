import { v4 as uuidv4 } from 'uuid';
import { IAdminStoragePlugin } from '../interfaces/IAdminStoragePlugin.js';
import { ITokenStoragePlugin } from '../interfaces/ITokenStoragePlugin.js';
import {
  ClientInfo, ClientRegistration, ClientConfig,
  UsageRecord, IngestionResult,
} from '../models/index.js';

export interface HeartbeatRequest {
  client_hostname: string;
  timestamp: string;
  launcher_version?: string;
  worker_version?: string;
  worker_status?: string;
  system_info?: {
    os: string;
    arch: string;
    platform: string;
    uptime_seconds?: number;
  };
  stats?: {
    files_uploaded_today?: number;
    last_scan_time?: string;
    directories_monitored?: number;
    errors_since_last_heartbeat?: number;
  };
}

export interface HeartbeatResponse {
  client_id: string;
  approved: boolean;
  config?: ClientConfig;
  update?: {
    enabled: boolean;
    available: boolean;
    version?: string;
    download_url?: string;
    checksum?: string;
    required?: boolean;
    check_interval_hours?: number;
    release_notes?: string;
  };
  server_time: string;
  message?: string;
  retry_after_seconds?: number;
}

export interface IngestRequest {
  clientHostname: string;
  fileInfo?: {
    original_path?: string;
    directory?: string;
    filename?: string;
    size_bytes?: number;
    modified_at?: string;
    line_count?: number;
  };
  records: UsageRecord[];
}

export interface IngestResponse {
  ingestion_id: string;
  status: string;
  records_processed: number;
  records_valid: number;
  records_invalid: number;
  storage_backend: string;
  processing_time_ms: number;
}

export class ClientService {
  constructor(
    private readonly adminStorage: IAdminStoragePlugin,
    private readonly tokenStorage: ITokenStoragePlugin,
  ) {}

  async processHeartbeat(request: HeartbeatRequest): Promise<{ status: number; body: HeartbeatResponse }> {
    const hostname = request.client_hostname;

    // Look up client by hostname
    let client = await this.adminStorage.getClientByHostname(hostname);

    if (!client) {
      // Register new client
      const registration: ClientRegistration = {
        hostname,
        launcher_version: request.launcher_version,
        worker_version: request.worker_version,
        system_info: request.system_info ? {
          os: request.system_info.os,
          arch: request.system_info.arch,
          platform: request.system_info.platform,
          uptime_seconds: request.system_info.uptime_seconds,
        } : undefined,
        registration_source: 'heartbeat',
      };
      client = await this.adminStorage.registerClient(registration);
    }

    // Update client info
    await this.adminStorage.updateClient(client.client_id, {
      last_seen: new Date().toISOString(),
      launcher_version: request.launcher_version ?? client.launcher_version,
      worker_version: request.worker_version ?? client.worker_version,
      worker_status: (request.worker_status as ClientInfo['worker_status']) ?? client.worker_status,
      system_info: request.system_info ? {
        os: request.system_info.os,
        arch: request.system_info.arch,
        platform: request.system_info.platform,
        uptime_seconds: request.system_info.uptime_seconds,
      } : client.system_info,
      stats: request.stats ? {
        ...client.stats,
        files_uploaded_today: request.stats.files_uploaded_today ?? client.stats.files_uploaded_today,
        last_scan_time: request.stats.last_scan_time ?? client.stats.last_scan_time,
        directories_monitored: request.stats.directories_monitored ?? client.stats.directories_monitored,
        errors_today: request.stats.errors_since_last_heartbeat ?? client.stats.errors_today,
      } : undefined,
    });

    // Check status
    if (client.status === 'pending') {
      return {
        status: 202,
        body: {
          client_id: client.client_id,
          approved: false,
          server_time: new Date().toISOString(),
          message: 'Client registration received. Awaiting administrator approval.',
          retry_after_seconds: 3600,
        },
      };
    }

    if (client.status === 'rejected' || client.status === 'suspended') {
      return {
        status: 403,
        body: {
          client_id: client.client_id,
          approved: false,
          server_time: new Date().toISOString(),
          message: 'Client access denied.',
        },
      };
    }

    // Approved - get merged config
    const config = await this.adminStorage.getClientConfig(client.client_id);

    return {
      status: 200,
      body: {
        client_id: client.client_id,
        approved: true,
        config: config ?? undefined,
        update: {
          enabled: true,
          available: false,
          check_interval_hours: 24,
        },
        server_time: new Date().toISOString(),
      },
    };
  }

  async processIngest(request: IngestRequest): Promise<{ status: number; body: IngestResponse | { error: string; message: string } }> {
    // Look up client
    const client = await this.adminStorage.getClientByHostname(request.clientHostname);
    if (!client) {
      return {
        status: 401,
        body: { error: 'unknown_client', message: 'Client not registered' },
      };
    }

    if (client.status !== 'approved') {
      return {
        status: 403,
        body: { error: 'client_not_approved', message: 'Client is not approved for ingestion' },
      };
    }

    // Store records
    const result: IngestionResult = await this.tokenStorage.storeUsageRecords(
      client.client_id,
      request.records,
    );

    // Update client stats
    await this.adminStorage.updateClient(client.client_id, {
      stats: {
        ...client.stats,
        total_uploads: client.stats.total_uploads + 1,
        total_records: client.stats.total_records + result.records_stored,
        last_upload: new Date().toISOString(),
        files_uploaded_today: client.stats.files_uploaded_today + 1,
      },
    });

    return {
      status: 200,
      body: {
        ingestion_id: uuidv4(),
        status: 'accepted',
        records_processed: result.records_processed,
        records_valid: result.records_stored,
        records_invalid: result.records_invalid + result.records_duplicate,
        storage_backend: 'memory',
        processing_time_ms: result.processing_time_ms,
      },
    };
  }
}
