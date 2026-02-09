import { memo } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

const colorMap = {
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  yellow: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
} as const;

function MetricCard({ title, value, subtitle, color = 'blue' }: MetricCardProps) {
  return (
    <div className={`rounded-lg border p-5 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-xs opacity-60">{subtitle}</p>}
    </div>
  );
}

export default memo(MetricCard);
