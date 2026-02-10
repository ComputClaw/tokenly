import { memo } from 'react';

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { classes: string; dot: string; pulse?: boolean }> = {
  approved: { classes: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  active: { classes: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  running: { classes: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', pulse: true },
  healthy: { classes: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  pending: { classes: 'bg-amber-500/15 text-amber-400', dot: 'bg-amber-400', pulse: true },
  rejected: { classes: 'bg-red-500/15 text-red-400', dot: 'bg-red-400' },
  disabled: { classes: 'bg-red-500/15 text-red-400', dot: 'bg-red-400' },
  stopped: { classes: 'bg-gray-500/15 text-gray-400', dot: 'bg-gray-400' },
  offline: { classes: 'bg-gray-500/15 text-gray-400', dot: 'bg-gray-400' },
};

const defaultConfig = { classes: 'bg-gray-500/15 text-gray-400', dot: 'bg-gray-400' };

function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const config = statusConfig[normalizedStatus] ?? defaultConfig;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}${config.pulse ? ' animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

export default memo(StatusBadge);
