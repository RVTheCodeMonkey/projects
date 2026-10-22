import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function NavLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-slate-600 bg-slate-900 px-4 py-3 text-white">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-baseline gap-0 text-lg tracking-tight">
          <span className="font-extrabold text-white">Core</span>
          <span className="font-extrabold accent-dot">.</span>
          <span className="font-light text-slate-300">base</span>
          <span className="ml-2 text-sm font-normal text-slate-400">Projects</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 sm:flex">
            <NavLink to="/">Projects</NavLink>
            {user?.is_admin && <NavLink to="/admin/users">Admin</NavLink>}
          </div>
          <span className="hidden text-sm text-slate-400 sm:inline">{user?.email}</span>
          <Link
            to="/change-password"
            className="hidden text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline"
          >
            Change password
          </Link>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-700 active:bg-slate-800"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 sm:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="mt-3 flex flex-col gap-3 border-t border-slate-700 pt-3 sm:hidden">
          <NavLink to="/" onClick={closeMenu}>Projects</NavLink>
          {user?.is_admin && <NavLink to="/admin/users" onClick={closeMenu}>Admin</NavLink>}
          <Link
            to="/change-password"
            onClick={closeMenu}
            className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            Change password
          </Link>
          <span className="text-sm text-slate-400">{user?.email}</span>
        </div>
      )}
    </header>
  );
}
