import { useEffect, useState, useRef, type FormEvent } from 'react';
import StatusBadge from '../components/common/StatusBadge.tsx';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import { formatRelative } from '../utils/formatRelative.ts';
import type { AdminUser } from '../types/api.ts';
import * as api from '../services/api-client.ts';

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<string | null>(null);

  function loadUsers() {
    setLoading(true);
    api
      .getUsers()
      .then((res) => setUsers(res.users))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleToggleStatus(user: AdminUser) {
    try {
      if (user.enabled) {
        await api.disableUser(user.username);
      } else {
        await api.enableUser(user.username);
      }
      loadUsers();
    } catch {
      setError(`Failed to ${user.enabled ? 'disable' : 'enable'} user`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Add User
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">{error}</div>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : users.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-12">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Username</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Last Login</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                    <td className="px-4 py-3 text-gray-500">{user.role}</td>
                    <td className="px-4 py-3 text-gray-500">{user.last_login ? formatRelative(user.last_login) : 'Never'}</td>
                    <td className="px-4 py-3"><StatusBadge status={user.enabled ? 'active' : 'disabled'} /></td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        {user.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => setChangePasswordUser(user.username)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddForm && (
        <AddUserModal
          onClose={() => setShowAddForm(false)}
          onCreated={() => {
            setShowAddForm(false);
            loadUsers();
          }}
        />
      )}

      {changePasswordUser && (
        <ChangePasswordModal
          username={changePasswordUser}
          onClose={() => setChangePasswordUser(null)}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('client_manager');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createUser(username, password, role);
      onCreated();
    } catch {
      setError('Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose} aria-label="Close modal">
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-title"
      >
        <div className="p-6">
          <h2 id="add-user-title" className="text-lg font-bold text-gray-900 mb-4">Create Admin User</h2>
          {error && <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id="new-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              />
            </div>
            <div>
              <label htmlFor="user-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="super_admin">Super Admin</option>
                <option value="client_manager">Client Manager</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.changePassword(username, '', newPassword);
      setSuccess(true);
      timerRef.current = setTimeout(onClose, 1500);
    } catch {
      setError('Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={onClose} aria-label="Close modal">
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="p-6">
          <h2 id="change-password-title" className="text-lg font-bold text-gray-900 mb-4">Change Password: {username}</h2>
          {error && <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">Password changed successfully</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-pw" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
            </div>
            <div>
              <label htmlFor="confirm-new-pw" className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input id="confirm-new-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {submitting ? 'Changing...' : 'Change Password'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
