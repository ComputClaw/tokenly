import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage.tsx';
import type { SystemStatus, TrendData } from '../types/api.ts';

// Mock chart.js to avoid canvas issues in jsdom
vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="chart">Chart</div>,
}));

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: vi.fn(),
  LinearScale: vi.fn(),
  PointElement: vi.fn(),
  LineElement: vi.fn(),
  Title: vi.fn(),
  Tooltip: vi.fn(),
  Legend: vi.fn(),
  Filler: vi.fn(),
}));

const mockStatus: SystemStatus = {
  server: { version: '1.0.0', uptime_seconds: 90061, memory_usage_mb: 256, cpu_usage_percent: 15 },
  storage: { backend: 'memory', status: 'healthy', total_records: 10000, total_size_mb: 50 },
  clients: { total: 12, active: 8, pending: 3 },
  ingestion: { files_today: 5, records_today: 2500, average_processing_time_ms: 45, errors_today: 1 },
};

const mockTrend: TrendData = {
  data_points: [
    { timestamp: '2026-02-01T00:00:00Z', value: 10.5, count: 50 },
    { timestamp: '2026-02-02T00:00:00Z', value: 12.3, count: 60 },
  ],
  total_value: 22.8,
  average_value: 11.4,
  metric: 'cost',
  interval: 'day',
};

const mockGetStatus = vi.fn();
const mockGetTrend = vi.fn();

vi.mock('../services/api-client.ts', () => ({
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getTrend: (...args: unknown[]) => mockGetTrend(...args),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state while fetching', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {}));
    mockGetTrend.mockReturnValue(new Promise(() => {}));
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders 4 metric cards when data loads', async () => {
    mockGetStatus.mockResolvedValue(mockStatus);
    mockGetTrend.mockResolvedValue(mockTrend);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Total Clients')).toBeInTheDocument();
    });

    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    expect(screen.getByText('Active Today')).toBeInTheDocument();
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('shows error state on API failure', async () => {
    mockGetStatus.mockRejectedValue(new Error('Network error'));
    mockGetTrend.mockRejectedValue(new Error('Network error'));
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
    });
  });

  it('renders chart when data loads', async () => {
    mockGetStatus.mockResolvedValue(mockStatus);
    mockGetTrend.mockResolvedValue(mockTrend);
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chart')).toBeInTheDocument();
    });
  });
});
