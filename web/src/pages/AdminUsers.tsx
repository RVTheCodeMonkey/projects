import { useEffect, useState } from 'react';
import api from '../api';

interface AdminUser {
  id: number;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(''), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setCreating(true);
    try {
      await api.post('/users', { email: newEmail, is_admin: newIsAdmin });
      setNewEmail('');
      setNewIsAdmin(false);
      setShowAdd(false);
      showMessage('User created and password link emailed.');
      await fetchUsers();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    setActionError('');
    try {
      await api.patch(`/users/${user.id}`, { is_admin: !user.is_admin });
      showMessage(`${user.email} admin status updated.`);
      await fetchUsers();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleSendPasswordLink = async (user: AdminUser) => {
    setActionError('');
    try {
      await api.post(`/users/${user.id}/send-password-link`);
      showMessage(`Password link sent to ${user.email}.`);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to send password link');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.email}? Their projects will be transferred to you.`)) {
      return;
    }
    setActionError('');
    try {
      await api.delete(`/users/${user.id}`);
      showMessage(`${user.email} deleted.`);
      await fetchUsers();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-slate-500">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin: Users</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Add user
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {actionError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}
      {actionMessage && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{actionMessage}</p>}

      {showAdd && (
        <form onSubmit={handleCreate} className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Create user</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[16rem]">
              <label className="mb-1 block text-xs font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-600"
              />
              Admin
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Created</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-700">{u.email}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {u.is_admin ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleToggleAdmin(u)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {u.is_admin ? 'Remove admin' : 'Make admin'}
                    </button>
                    <button
                      onClick={() => handleSendPasswordLink(u)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Send password link
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
