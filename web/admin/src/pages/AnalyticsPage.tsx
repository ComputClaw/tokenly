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
import type { AnalyticsSummary, TrendDataPoint, TopUsageEntry, CostBreakdownEntry } from '../types/api.ts';
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
  const [trend, setTrend] = useState<TrendDataPoint[]>([]);
  const [topServices, setTopServices] = useState<TopUsageEntry[]>([]);
  const [topModels, setTopModels] = useState<TopUsageEntry[]>([]);
  const [costs, setCosts] = useState<CostBreakdownEntry[]>([]);
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

  const trendChart = useMemo(() => ({
    labels: trend.map((d) => d.date),
    datasets: [
      {
        label: 'Cost ($)',
        data: trend.map((d) => d.cost),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }), [trend]);

  const trendOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false as const } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v: string | number) => `$${v}` } } },
  }), []);

  const servicesChart = useMemo(() => ({
    labels: topServices.map((s) => s.name),
    datasets: [
      {
        label: 'Cost ($)',
        data: topServices.map((s) => s.cost),
        backgroundColor: chartColors,
      },
    ],
  }), [topServices]);

  const modelsChart = useMemo(() => ({
    labels: topModels.map((m) => m.name),
    datasets: [
      {
        label: 'Cost ($)',
        data: topModels.map((m) => m.cost),
        backgroundColor: chartColors,
      },
    ],
  }), [topModels]);

  const barOptions = useMemo(() => ({
    responsive: true,
    plugins: { legend: { display: false as const } },
  }), []);

  if (loading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (error) {
    return <div className="bg-red-50 text-red-700 p-4 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Cost" value={`$${summary?.total_cost.toFixed(2) ?? '0.00'}`} color="blue" />
        <MetricCard title="Total Tokens" value={summary?.total_tokens.toLocaleString() ?? '0'} color="green" />
        <MetricCard title="Total Requests" value={summary?.total_requests.toLocaleString() ?? '0'} color="yellow" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Trend</h2>
        {trend.length > 0 ? (
          <Line data={trendChart} options={trendOptions} />
        ) : (
          <p className="text-gray-500 text-sm">No data available</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Services</h2>
          {topServices.length > 0 ? (
            <Bar data={servicesChart} options={barOptions} />
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Models</h2>
          {topModels.length > 0 ? (
            <Bar data={modelsChart} options={barOptions} />
          ) : (
            <p className="text-gray-500 text-sm">No data available</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 pb-3">
          <h2 className="text-lg font-semibold text-gray-900">Cost Breakdown</h2>
        </div>
        {costs.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">No data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Model</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Tokens</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {costs.map((entry, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-gray-900">{entry.service}</td>
                    <td className="px-4 py-3 text-gray-900">{entry.model}</td>
                    <td className="px-4 py-3 text-right text-gray-900">${entry.cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{entry.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{entry.requests.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
