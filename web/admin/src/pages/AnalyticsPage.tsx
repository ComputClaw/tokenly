import { useEffect, useState, useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import MetricCard from '../components/common/MetricCard.tsx';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import Card from '../components/ui/Card.tsx';
import { Select } from '../components/ui/Input.tsx';
import type { AnalyticsSummary, TrendData, TopUsageResult, CostBreakdown } from '../types/api.ts';
import * as api from '../services/api-client.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const periods = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
];

const chartColors = ['rgb(59, 130, 246)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)', 'rgb(239, 68, 68)', 'rgb(139, 92, 246)'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [topServices, setTopServices] = useState<TopUsageResult | null>(null);
  const [topModels, setTopModels] = useState<TopUsageResult | null>(null);
  const [costs, setCosts] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getAnalyticsSummary(period),
      api.getTrend(period),
      api.getTopUsage('service', period),
      api.getTopUsage('model', period),
      api.getCostBreakdown(period),
    ])
      .then(([s, t, ts, tm, c]) => {
        setSummary(s);
        setTrend(t);
        setTopServices(ts);
        setTopModels(tm);
        setCosts(c);
      })
      .catch(() => setError('Failed to load analytics data'))
      .finally(() => setLoading(false));
  }, [period]);

  const trendPoints = trend?.data_points ?? [];

  const trendChart = useMemo(() => ({
    labels: trendPoints.map((d) => d.timestamp.slice(0, 10)),
    datasets: [
      {
        label: trend?.metric ?? 'Cost',
        data: trendPoints.map((d) => d.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }), [trendPoints, trend?.metric]);

  const trendOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false as const } },
    scales: {
      x: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
      y: { beginAtZero: true, ticks: { color: '#9ca3af', callback: (v: string | number) => `$${v}` }, grid: { color: '#1f2937' } },
    },
  }), []);

  const serviceRankings = topServices?.rankings ?? [];
  const modelRankings = topModels?.rankings ?? [];

  const servicesChart = useMemo(() => ({
    labels: serviceRankings.map((s) => s.name),
    datasets: [
      {
        label: 'Value',
        data: serviceRankings.map((s) => s.value),
        backgroundColor: chartColors,
      },
    ],
  }), [serviceRankings]);

  const modelsChart = useMemo(() => ({
    labels: modelRankings.map((m) => m.name),
    datasets: [
      {
        label: 'Value',
        data: modelRankings.map((m) => m.value),
        backgroundColor: chartColors,
      },
    ],
  }), [modelRankings]);

  const barOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false as const } },
    scales: {
      x: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#9ca3af' }, grid: { color: '#1f2937' } },
    },
  }), []);

  if (loading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (error) {
    return <div className="bg-red-500/10 text-red-400 p-4 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
        <Select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          compact
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Cost" value={`$${summary?.total_cost.toFixed(2) ?? '0.00'}`} color="blue" />
        <MetricCard title="Total Tokens" value={summary?.total_tokens.toLocaleString() ?? '0'} color="green" />
        <MetricCard title="Total Requests" value={summary?.total_requests.toLocaleString() ?? '0'} color="yellow" />
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Usage Trend</h2>
        {trendPoints.length > 0 ? (
          <Line data={trendChart} options={trendOptions} />
        ) : (
          <p className="text-gray-500 text-sm">No data available</p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Top Services</h2>
          {serviceRankings.length > 0 ? (
            <Bar data={servicesChart} options={barOptions} />
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-100 mb-4">Top Models</h2>
          {modelRankings.length > 0 ? (
            <Bar data={modelsChart} options={barOptions} />
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-6 pb-3">
          <h2 className="text-lg font-semibold text-gray-100">Cost Breakdown</h2>
        </div>
        {!costs || costs.breakdowns.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">No data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 border-y border-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Dimensions</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">%</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Tokens</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {costs.breakdowns.map((entry, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-gray-100">{Object.values(entry.dimensions).join(' / ')}</td>
                    <td className="px-4 py-3 text-right text-gray-100">${entry.cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{entry.percentage.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-gray-500">{entry.token_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{entry.request_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
