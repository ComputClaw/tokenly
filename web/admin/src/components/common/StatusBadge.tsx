import { memo } from 'react';

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  active: 'bg-green-100 text-green-800',
  running: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
  stopped: 'bg-gray-100 text-gray-800',
  offline: 'bg-gray-100 text-gray-800',
  disabled: 'bg-red-100 text-red-800',
  healthy: 'bg-green-100 text-green-800',
};

function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const style = statusStyles[normalizedStatus] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export default memo(StatusBadge);
