import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { TimelineView } from '../components/Timeline/TimelineView';
import type { Task } from './ProjectView';

interface PublicProjectData {
  id: number;
  name: string;
  original_filename: string;
  file_format: string;
  created_at: string;
  role: string;
  data: {
    name: string;
    start_date: string;
    finish_date: string;
    tasks: Task[];
    row_labels?: Record<string, string>;
  };
}

export default function PublicProjectView() {
  const { token } = useParams<{ token: string }>();
  const [project, setProject] = useState<PublicProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    api
      .get(`/public/projects/${token}`)
      .then(({ data }) => setProject(data))
      .catch((err) => setError(err.response?.data?.detail || 'Project not found'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <p className="py-6 text-slate-500">Loading project...</p>;
  }

  if (error || !project) {
    return <p className="py-6 text-red-600">{error || 'Project not found'}</p>;
  }

  const formatDate = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  return (
    <div className="flex h-full flex-col py-6">
      <div className="shrink-0">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">
            {project.original_filename} &middot; {project.file_format} &middot; Shared publicly
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-green-600 hover:underline">
          Sign in to edit
        </Link>
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
          <p className="mt-1 font-medium text-slate-900">{project.data.tasks.length}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Timeline</h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          Read-only
        </span>
      </div>
      </div>

      <div className="min-h-0 flex-1">
        <TimelineView
          tasks={project.data.tasks}
          rowLabels={project.data.row_labels || {}}
          onTaskClick={() => {}}
        />
      </div>
    </div>
  );
}
