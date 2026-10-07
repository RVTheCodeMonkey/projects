import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b-2 border-slate-600 bg-slate-900 px-4 py-3 text-white">
      <Link to="/" className="flex items-baseline gap-0 text-lg tracking-tight">
        <span className="font-extrabold text-white">Core</span>
        <span className="font-extrabold accent-dot">.</span>
        <span className="font-light text-slate-300">base</span>
        <span className="ml-2 text-sm font-normal text-slate-400">Projects</span>
      </Link>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-slate-400 sm:inline">{user?.email}</span>
        <button
          onClick={logout}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700 active:bg-slate-800"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
