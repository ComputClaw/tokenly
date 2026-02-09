import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientsPage from './ClientsPage.tsx';
import type { ClientListResponse } from '../types/api.ts';

vi.mock('../utils/formatRelative.ts', () => ({
  formatRelative: (iso: string) => iso,
}));

const mockClientData: ClientListResponse = {
  clients: [
    {
      client_id: 'c1',
      hostname: 'server-alpha',
      status: 'approved',
      last_seen: '2026-02-09T10:00:00Z',
      launcher_version: '1.0.0',
      worker_version: '1.0.0',
      worker_status: 'running',
      system_info: { os: 'linux', platform: 'x64' },
      stats: { total_uploads: 100, total_records: 5000, last_upload: '2026-02-09T09:00:00Z' },
    },
    {
      client_id: 'c2',
      hostname: 'workstation-beta',
      status: 'pending',
      last_seen: '2026-02-09T08:00:00Z',
      launcher_version: '1.0.0',
      worker_version: '1.0.0',
      worker_status: 'stopped',
      system_info: { os: 'windows', platform: 'x64' },
      stats: { total_uploads: 5, total_records: 200, last_upload: '2026-02-08T12:00:00Z' },
    },
  ],
  total: 2,
  summary: { approved: 1, pending: 1, rejected: 0, active: 1 },
};

const mockGetClients = vi.fn();
const mockApproveClient = vi.fn();
const mockRejectClient = vi.fn();
const mockDeleteClient = vi.fn();

vi.mock('../services/api-client.ts', () => ({
  getClients: (...args: unknown[]) => mockGetClients(...args),
  approveClient: (...args: unknown[]) => mockApproveClient(...args),
  rejectClient: (...args: unknown[]) => mockRejectClient(...args),
  deleteClient: (...args: unknown[]) => mockDeleteClient(...args),
}));

describe('ClientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClients.mockResolvedValue(mockClientData);
    mockApproveClient.mockResolvedValue(undefined);
    mockRejectClient.mockResolvedValue(undefined);
  });

  it('renders client table', async () => {
    render(<ClientsPage />);
    await waitFor(() => {
      expect(screen.getByText('server-alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('workstation-beta')).toBeInTheDocument();
  });

  it('search filters by hostname', async () => {
    const user = userEvent.setup();
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText('server-alpha')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/search hostname/i), 'alpha');

    expect(screen.getByText('server-alpha')).toBeInTheDocument();
    expect(screen.queryByText('workstation-beta')).not.toBeInTheDocument();
  });

  it('status tabs filter the list', async () => {
    const user = userEvent.setup();
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText('server-alpha')).toBeInTheDocument();
    });

    // Click "Pending" tab - this triggers a new API call with filter
    const pendingTab = screen.getByRole('button', { name: /pending/i });
    await user.click(pendingTab);

    await waitFor(() => {
      expect(mockGetClients).toHaveBeenCalledWith('pending');
    });
  });

  it('approve button calls API with correct client ID', async () => {
    const user = userEvent.setup();
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText('workstation-beta')).toBeInTheDocument();
    });

    // Click on the pending client row to open the detail modal
    await user.click(screen.getByText('workstation-beta'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const approveButton = screen.getByRole('button', { name: /approve/i });
    await user.click(approveButton);

    expect(mockApproveClient).toHaveBeenCalledWith('c2', undefined);
  });

  it('reject button calls API', async () => {
    const user = userEvent.setup();
    render(<ClientsPage />);

    await waitFor(() => {
      expect(screen.getByText('workstation-beta')).toBeInTheDocument();
    });

    await user.click(screen.getByText('workstation-beta'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const rejectButton = screen.getByRole('button', { name: /^reject$/i });
    await user.click(rejectButton);

    expect(mockRejectClient).toHaveBeenCalledWith('c2');
  });
});
