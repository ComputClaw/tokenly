import { useEffect, useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import MetricCard from '../components/common/MetricCard.tsx';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import Card from '../components/ui/Card.tsx';
import type { SystemStatus, TrendData } from '../types/api.ts';
import * as api from '../services/api-client.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function DashboardPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStatus(), api.getTrend('30d')])
      .then(([s, t]) => {
        setStatus(s);
        setTrend(t);
      })
      .catch(() => setError('Failed to load dashboard data'))
      .finally(() => setLoading(false));
  }, []);

  const dataPoints = trend?.data_points ?? [];

  const chartData = useMemo(() => ({
    labels: dataPoints.map((d) => d.timestamp.slice(0, 10)),
    datasets: [
      {
        label: trend?.metric ?? 'Cost',
        data: dataPoints.map((d) => d.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }), [dataPoints, trend?.metric]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    plugins: {
      legend: { display: false as const },
    },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v: string | number) => `$${v}` } },
    },
  }), []);

  if (loading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (error) {
    return <div className="bg-red-50 text-red-700 p-4 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Clients" value={status?.clients.total ?? 0} color="blue" />
        <MetricCard title="Pending Approval" value={status?.clients.pending ?? 0} subtitle="Need action" color="yellow" />
        <MetricCard title="Active Today" value={status?.clients.active ?? 0} subtitle="Last 24h" color="green" />
        <MetricCard
          title="System Health"
          value={status?.storage.status === 'healthy' ? 'OK' : 'Issue'}
          subtitle="All systems"
          color={status?.storage.status === 'healthy' ? 'green' : 'red'}
        />
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Trend</h2>
        {dataPoints.length > 0 ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <p className="text-gray-500 text-sm">No trend data available</p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Server Info</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Version</dt>
              <dd className="text-gray-900 font-medium">{status?.server.version}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Uptime</dt>
              <dd className="text-gray-900 font-medium">{formatUptime(status?.server.uptime_seconds ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Memory</dt>
              <dd className="text-gray-900 font-medium">{status?.server.memory_usage_mb} MB</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Ingestion Today</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Files</dt>
              <dd className="text-gray-900 font-medium">{status?.ingestion.files_today}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Records</dt>
              <dd className="text-gray-900 font-medium">{status?.ingestion.records_today?.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Avg Processing</dt>
              <dd className="text-gray-900 font-medium">{status?.ingestion.average_processing_time_ms} ms</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Errors</dt>
              <dd className="text-gray-900 font-medium">{status?.ingestion.errors_today}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}
