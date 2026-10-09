import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProjectView from './pages/ProjectView';
import InviteAccept from './pages/InviteAccept';
import PublicProjectView from './pages/PublicProjectView';
import AdminUsers from './pages/AdminUsers';
import SetPassword from './pages/SetPassword';
import Navbar from './components/Navbar';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {user && <Navbar />}
      <main className="min-h-0 flex-1 px-4 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/projects/:id" element={user ? <ProjectView /> : <Navigate to="/login" />} />
          <Route path="/admin/users" element={user?.is_admin ? <AdminUsers /> : <Navigate to="/" />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/invite/:token" element={<InviteAccept />} />
          <Route path="/public/:token" element={<PublicProjectView />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
