import { useEffect, useState } from 'react';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import Button from '../components/ui/Button.tsx';
import Card from '../components/ui/Card.tsx';
import type { AuditEntry } from '../types/api.ts';
import * as api from '../services/api-client.ts';

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLog({ page, page_size: pageSize })
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .catch(() => setError('Failed to load audit log'))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Audit Trail</h1>

      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-md text-sm">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-12">No audit entries found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/30 border-b border-gray-700/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">User</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-100">{entry.user}</td>
                    <td className="px-4 py-3 text-gray-100">{entry.action}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {entry.resource_type}
                      {entry.resource_id ? `: ${entry.resource_id}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700/40">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} entries)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
