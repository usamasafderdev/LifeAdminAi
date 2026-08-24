import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import Tasks from './pages/Tasks';
import Reminders from './pages/Reminders';
import AddInformation from './pages/AddInformation';
import Calendar from './pages/Calendar';
import SearchPage from './pages/SearchPage';
import Settings from './pages/Settings';
import { AskLifeAdmin, DocumentChat } from './pages/Chat';
import { Login, Register } from './pages/Auth';

function AuthLoading() { return <div className="auth-loading"><span className="button-spinner" /><strong>Opening LifeAdmin…</strong></div>; }
function ProtectedRoute() { const { isAuthenticated, isInitializing } = useAuth(); if (isInitializing) return <AuthLoading />; return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />; }
function PublicRoute() { const { isAuthenticated, isInitializing } = useAuth(); if (isInitializing) return <AuthLoading />; return isAuthenticated ? <Navigate to="/app/dashboard" replace /> : <Outlet />; }
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route element={<ProtectedRoute />}>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="documents/:id/chat" element={<DocumentChat />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="ask" element={<AskLifeAdmin />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="add" element={<AddInformation />} />
      </Route>
      </Route>
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
