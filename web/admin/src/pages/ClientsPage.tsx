import { useEffect, useState, useCallback } from 'react';
import StatusBadge from '../components/common/StatusBadge.tsx';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import { formatRelative } from '../utils/formatRelative.ts';
import type { Client, ClientListResponse } from '../types/api.ts';
import * as api from '../services/api-client.ts';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function ClientsPage() {
  const [data, setData] = useState<ClientListResponse | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const loadClients = useCallback(() => {
    setLoading(true);
    api
      .getClients(filter === 'all' ? undefined : filter)
      .then(setData)
      .catch(() => setError('Failed to load clients'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filtered = data?.clients.filter((c) =>
    c.hostname.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  async function handleApprove(clientId: string, notes?: string) {
    try {
      await api.approveClient(clientId, notes);
      loadClients();
      setSelectedClient(null);
    } catch {
      setError('Failed to approve client');
    }
  }

  async function handleReject(clientId: string) {
    try {
      await api.rejectClient(clientId);
      loadClients();
      setSelectedClient(null);
    } catch {
      setError('Failed to reject client');
    }
  }

  async function handleDelete(clientId: string) {
    try {
      await api.deleteClient(clientId);
      loadClients();
      setSelectedClient(null);
    } catch {
      setError('Failed to delete client');
    }
  }

  const tabs: { key: StatusFilter; label: string; count?: number | undefined }[] = [
    { key: 'all', label: 'All', count: data ? (data.summary.approved + data.summary.pending + data.summary.rejected) : undefined },
    { key: 'pending', label: 'Pending', count: data?.summary.pending },
    { key: 'approved', label: 'Active', count: data?.summary.approved },
    { key: 'rejected', label: 'Rejected', count: data?.summary.rejected },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Clients</h1>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search hostname..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-12">No clients found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Hostname</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Last Seen</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Worker</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Uploads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((client) => (
                  <tr
                    key={client.client_id}
                    onClick={() => setSelectedClient(client)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{client.hostname}</td>
                    <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{formatRelative(client.last_seen)}</td>
                    <td className="px-4 py-3"><StatusBadge status={client.worker_status} /></td>
                    <td className="px-4 py-3 text-right text-gray-500">{client.stats.total_uploads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function ClientDetailModal({
  client,
  onClose,
  onApprove,
  onReject,
  onDelete,
}: {
  client: Client;
  onClose: () => void;
  onApprove: (id: string, notes?: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const modalTitleId = `client-detail-title-${client.client_id}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      onClick={onClose}
      aria-label="Close modal"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 id={modalTitleId} className="text-lg font-bold text-gray-900">{client.hostname}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            {client.approved_by && (
              <span className="text-xs text-gray-500">
                by {client.approved_by}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">System Information</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">OS</dt>
                <dd className="text-gray-900">{client.system_info.platform}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Launcher</dt>
                <dd className="text-gray-900">v{client.launcher_version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Worker</dt>
                <dd className="text-gray-900">v{client.worker_version}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Statistics</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Total Uploads</dt>
                <dd className="text-gray-900">{client.stats.total_uploads}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Total Records</dt>
                <dd className="text-gray-900">{client.stats.total_records.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Last Upload</dt>
                <dd className="text-gray-900">{client.stats.last_upload ? formatRelative(client.stats.last_upload) : 'Never'}</dd>
              </div>
            </dl>
          </div>

          {client.status === 'pending' && (
            <div>
              <label htmlFor="approval-notes" className="block text-sm font-medium text-gray-500 mb-1">
                Approval Notes
              </label>
              <textarea
                id="approval-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for approval..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-gray-200">
            {client.status === 'pending' && (
              <>
                <button
                  onClick={() => onApprove(client.client_id, notes || undefined)}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => onReject(client.client_id)}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                >
                  Reject
                </button>
              </>
            )}
            <button
              onClick={() => onDelete(client.client_id)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
