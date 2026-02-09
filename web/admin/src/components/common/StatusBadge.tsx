import { memo } from 'react';

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  running: 'bg-emerald-500/15 text-emerald-400',
  healthy: 'bg-emerald-500/15 text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-400',
  rejected: 'bg-red-500/15 text-red-400',
  disabled: 'bg-red-500/15 text-red-400',
  stopped: 'bg-gray-500/15 text-gray-400',
  offline: 'bg-gray-500/15 text-gray-400',
};

function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const style = statusStyles[normalizedStatus] ?? 'bg-gray-500/15 text-gray-400';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export default memo(StatusBadge);
