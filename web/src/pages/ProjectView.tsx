import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import TaskEditModal from '../components/TaskEditModal';
import { TimelineView } from '../components/Timeline/TimelineView';

export interface Task {
  uid: string;
  id: string;
  name: string;
  outline_level: number;
  outline_number: string;
  start: string;
  finish: string;
  duration: { iso: string; days: number; hours: number; minutes: number } | null;
  percent_complete: number;
  milestone: boolean;
  summary: boolean;
  critical: boolean;
  color?: string;
}

interface Member {
  user_id: number;
  email: string;
  role: string;
}

interface ProjectData {
  id: number;
  name: string;
  original_filename: string;
  file_format: string;
  created_at: string;
  updated_at?: string;
  is_public: boolean;
  public_token: string | null;
  role: string;
  members: Member[];
  data: {
    name: string;
    start_date: string;
    finish_date: string;
    tasks: Task[];
    row_labels?: Record<string, string>;
  };
}

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rowLabels, setRowLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'owner' | 'editor' | 'viewer'>('viewer');
  const versionInputRef = useRef<HTMLInputElement>(null);

  const fetchProject = async () => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setProject(data);
      setTasks(data.data.tasks);
      setRowLabels(data.data.row_labels || {});
    } catch (err) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

  const handleUpdateTask = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.uid === updated.uid ? updated : t)));
    setEditingTask(null);
  };

  const handleDeleteTask = (task: Task) => {
    setTasks((prev) =>
      prev.filter((t) => {
        if (t.uid === task.uid) return false;
        // When deleting a summary/group task, also remove its descendants
        if (task.summary && t.outline_number.startsWith(`${task.outline_number}.`)) {
          return false;
        }
        return true;
      })
    );
    setEditingTask(null);
  };

  const handleAddRow = () => {
    const topTasks = tasks.filter((t) => !t.outline_number.includes('.'));
    const maxTop = topTasks.reduce((max, t) => {
      const n = parseInt(t.outline_number, 10);
      return Math.max(max, isNaN(n) ? 0 : n);
    }, 0);

    const now = new Date();
    const start = `${now.toISOString().slice(0, 10)}T08:00:00`;
    const finish = `${now.toISOString().slice(0, 10)}T17:00:00`;

    const newTask: Task = {
      uid: `new-${Date.now()}`,
      id: '',
      name: 'New row',
      outline_level: 1,
      outline_number: String(maxTop + 1),
      start,
      finish,
      duration: { iso: 'PT9H0M0S', days: 0, hours: 9, minutes: 0 },
      percent_complete: 0,
      milestone: false,
      summary: false,
      critical: false,
    };

    setTasks((prev) => [...prev, newTask]);
  };

  const handleRenameRow = (groupOutlineNumber: string, newName: string) => {
    setRowLabels((prev) => {
      const trimmed = newName.trim();
      if (!trimmed) {
        const next = { ...prev };
        delete next[groupOutlineNumber];
        return next;
      }
      return { ...prev, [groupOutlineNumber]: trimmed };
    });
  };

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    try {
      await api.post(`/projects/${project.id}/save`, { tasks, row_labels: rowLabels });
      await fetchProject();
    } catch (err) {
      alert('Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!project) return;
    setExporting(true);
    try {
      const response = await api.post(
        `/projects/${project.id}/export`,
        { tasks, row_labels: rowLabels },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${project.name.replace(/\s+/g, '_')}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export project');
    } finally {
      setExporting(false);
    }
  };

  const handleVersionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    setUploadingVersion(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post(`/projects/${project.id}/version`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchProject();
    } catch (err) {
      alert('Failed to upload new version');
    } finally {
      setUploadingVersion(false);
      if (versionInputRef.current) versionInputRef.current.value = '';
    }
  };

  const handleAddTask = (groupOutlineNumber: string) => {
    const groupTasks = tasks.filter((t) => t.outline_number.split('.')[0] === groupOutlineNumber);
    const maxSub = groupTasks.reduce((max, t) => {
      const parts = t.outline_number.split('.');
      if (parts.length > 1 && parts[0] === groupOutlineNumber) {
        const n = parseInt(parts[parts.length - 1], 10);
        return Math.max(max, isNaN(n) ? 0 : n);
      }
      return max;
    }, 0);

    const now = new Date();
    const start = `${now.toISOString().slice(0, 10)}T08:00:00`;
    const finish = `${now.toISOString().slice(0, 10)}T17:00:00`;

    const newTask: Task = {
      uid: `new-${Date.now()}`,
      id: '',
      name: 'New task',
      outline_level: 2,
      outline_number: `${groupOutlineNumber}.${maxSub + 1}`,
      start,
      finish,
      duration: { iso: 'PT8H0M0S', days: 0, hours: 8, minutes: 0 },
      percent_complete: 0,
      milestone: false,
      summary: false,
      critical: false,
    };

    setTasks((prev) => [...prev, newTask]);
  };

  const handleCreateInvite = async () => {
    if (!project) return;
    try {
      const { data } = await api.post(`/projects/${project.id}/invites`, { role: inviteRole });
      setInviteLink(`${window.location.origin}${data.link}`);
    } catch (err) {
      alert('Failed to create invite');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !addEmail) return;
    try {
      await api.post(`/projects/${project.id}/members`, { email: addEmail, role: addRole });
      setAddEmail('');
      await fetchProject();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!project) return;
    try {
      await api.delete(`/projects/${project.id}/members/${userId}`);
      await fetchProject();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove member');
    }
  };

  const handleChangeRole = async (userId: number, role: string) => {
    if (!project) return;
    try {
      await api.patch(`/projects/${project.id}/members/${userId}`, { role });
      await fetchProject();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleTogglePublic = async () => {
    if (!project || !isOwner) return;
    try {
      const { data } = await api.post(`/projects/${project.id}/public`, {
        is_public: !project.is_public,
      });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              is_public: data.is_public,
              public_token: data.public_token,
            }
          : prev
      );
    } catch (err) {
      alert('Failed to update public sharing');
    }
  };

  if (loading) {
    return <p className="py-6 text-slate-500">Loading project...</p>;
  }

  if (error || !project) {
    return <p className="py-6 text-red-600">{error || 'Project not found'}</p>;
  }

  const canEdit = project.role === 'owner' || project.role === 'editor';
  const isOwner = project.role === 'owner';

  const formatDate = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  return (
    <div className="flex h-full flex-col py-6">
      <div className="shrink-0">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/" className="text-sm font-medium text-green-600 hover:underline">
            &larr; Back to projects
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">
            {project.original_filename} &middot; {project.file_format} &middot; Uploaded{' '}
            {new Date(project.created_at).toLocaleString()}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                project.role === 'owner'
                  ? 'bg-purple-100 text-purple-700'
                  : project.role === 'editor'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {project.role}
            </span>
            {!canEdit && (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                read-only
              </span>
            )}
            {project.is_public && (
              <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                public link active
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:bg-slate-900">
                <input
                  ref={versionInputRef}
                  type="file"
                  accept=".mpp,.mpt,.mpx,.xml"
                  className="hidden"
                  onChange={handleVersionUpload}
                  disabled={uploadingVersion}
                />
                {uploadingVersion ? 'Uploading...' : 'Upload new version'}
              </label>
            </>
          )}
          {canEdit && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? 'Exporting...' : 'Export XML'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Project start</p>
          <p className="mt-1 font-medium text-slate-900">{formatDate(project.data.start_date)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Project finish</p>
          <p className="mt-1 font-medium text-slate-900">{formatDate(project.data.finish_date)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tasks</p>
          <p className="mt-1 font-medium text-slate-900">{tasks.length}</p>
        </div>
      </div>

      {/* Members & sharing panel */}
      <div className="mb-6 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <button
          onClick={() => setShowMembers((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="font-semibold text-slate-900">Members & sharing</span>
          <span className="text-sm text-slate-500">{showMembers ? 'Hide' : 'Show'}</span>
        </button>
        {showMembers && (
          <div className="border-t border-slate-200 px-4 py-4">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              {isOwner && (
                <button
                  onClick={handleTogglePublic}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    project.is_public
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {project.is_public ? 'Public link on' : 'Public link off'}
                </button>
              )}
              {isOwner && project.is_public && project.public_token && (
                <div className="text-sm text-slate-600">
                  Link:{' '}
                  <a
                    href={`/public/${project.public_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-600 hover:underline"
                  >
                    {window.location.origin}/public/{project.public_token}
                  </a>
                </div>
              )}
            </div>

            {canEdit && (
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Invite by link</h3>
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                    <button
                      onClick={handleCreateInvite}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Create link
                    </button>
                  </div>
                  {inviteLink && (
                    <div className="mt-2 text-sm text-slate-600">
                      <code className="break-all rounded bg-slate-100 px-2 py-1">{inviteLink}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        className="ml-2 text-green-600 hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddMember}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Add member by email</h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    <select
                      value={addRole}
                      onChange={(e) => setAddRole(e.target.value as 'owner' | 'editor' | 'viewer')}
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      {isOwner && <option value="owner">Owner</option>}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            )}

            <h3 className="mb-2 text-sm font-semibold text-slate-900">Members</h3>
            <ul className="divide-y divide-slate-100">
              {project.members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-700">{m.email}</span>
                  <div className="flex items-center gap-2">
                    {isOwner && m.user_id !== project.members.find((x) => x.role === 'owner')?.user_id ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="owner">Owner</option>
                      </select>
                    ) : (
                      <span className="text-sm text-slate-500">{m.role}</span>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveMember(m.user_id)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Timeline</h2>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              + Add row
            </button>
          )}
          <span className="text-xs text-slate-500">
            {canEdit ? 'Click a task bar to edit' : 'Read-only view'}
          </span>
        </div>
      </div>
      </div>

      <div className="min-h-0 flex-1">
        <TimelineView
          tasks={tasks}
          rowLabels={rowLabels}
          onTaskClick={(task) => canEdit && !task.summary && setEditingTask(task)}
          onAddTask={canEdit ? handleAddTask : undefined}
          onRenameRow={canEdit ? handleRenameRow : undefined}
        />
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onSave={handleUpdateTask}
          onDelete={() => handleDeleteTask(editingTask)}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
