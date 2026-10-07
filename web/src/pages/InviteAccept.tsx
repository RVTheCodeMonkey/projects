import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

interface InviteInfo {
  project_id: number;
  project_name: string;
  role: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get(`/invites/${token}`)
      .then(({ data }) => setInfo(data))
      .catch((err) => setError(err.response?.data?.detail || 'Invite not found'));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const { data } = await api.post(`/invites/${token}/accept`);
      navigate(`/projects/${data.project_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading || (!info && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Loading invite...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Invite</h1>
        <p className="mt-2 text-red-600">{error}</p>
        <Link to="/" className="mt-4 text-green-600 hover:underline">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Project invitation</h1>
      <p className="mt-2 text-slate-600">
        You have been invited to <strong>{info?.project_name}</strong> as{' '}
        <strong>{info?.role}</strong>.
      </p>

      {!user ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">Sign in or create an account to accept.</p>
          <div className="flex justify-center gap-3">
            <Link
              to={`/login?redirect=/invite/${token}`}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Sign in
            </Link>
            <Link
              to={`/register?redirect=/invite/${token}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Register
            </Link>
          </div>
        </div>
      ) : (
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="mt-6 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {accepting ? 'Accepting...' : 'Accept invitation'}
        </button>
      )}
    </div>
  );
}
