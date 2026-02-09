import { useEffect, useState, useRef, type FormEvent } from 'react';
import StatusBadge from '../components/common/StatusBadge.tsx';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import Button from '../components/ui/Button.tsx';
import Card from '../components/ui/Card.tsx';
import Input from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Input.tsx';
import Modal from '../components/ui/Modal.tsx';
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
        <h1 className="text-2xl font-bold text-gray-100">Users</h1>
        <Button onClick={() => setShowAddForm(true)}>
          Add User
        </Button>
      </div>

      {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-md text-sm">{error}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : users.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-12">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 border-b border-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Username</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Last Login</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td className="px-4 py-3 font-medium text-gray-100">{user.username}</td>
                    <td className="px-4 py-3 text-gray-500">{user.role}</td>
                    <td className="px-4 py-3 text-gray-500">{user.last_login ? formatRelative(user.last_login) : 'Never'}</td>
                    <td className="px-4 py-3"><StatusBadge status={user.enabled ? 'active' : 'disabled'} /></td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className="text-sm text-gray-400 hover:text-gray-200"
                      >
                        {user.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => setChangePasswordUser(user.username)}
                        className="text-sm text-gray-400 hover:text-gray-200"
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
      </Card>

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
    <Modal onClose={onClose} labelledBy="add-user-title">
        <div className="p-6">
          <h2 id="add-user-title" className="text-lg font-bold text-gray-100 mb-4">Create Admin User</h2>
          {error && <div className="mb-4 p-3 rounded-md bg-red-500/10 text-red-400 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-username" className="block text-sm font-medium text-gray-300 mb-1">Username</label>
              <Input
                id="new-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="user-role" className="block text-sm font-medium text-gray-300 mb-1">Role</label>
              <Select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full"
              >
                <option value="super_admin">Super Admin</option>
                <option value="client_manager">Client Manager</option>
                <option value="viewer">Viewer</option>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create User'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
    </Modal>
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
    <Modal onClose={onClose} labelledBy="change-password-title">
        <div className="p-6">
          <h2 id="change-password-title" className="text-lg font-bold text-gray-100 mb-4">Change Password: {username}</h2>
          {error && <div className="mb-4 p-3 rounded-md bg-red-500/10 text-red-400 text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 rounded-md bg-emerald-500/10 text-emerald-400 text-sm">Password changed successfully</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-pw" className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
              <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} className="w-full" />
            </div>
            <div>
              <label htmlFor="confirm-new-pw" className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
              <Input id="confirm-new-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Changing...' : 'Change Password'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
    </Modal>
  );
}
