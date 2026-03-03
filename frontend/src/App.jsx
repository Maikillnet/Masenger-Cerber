import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CabinetPage from './pages/CabinetPage';
import ChatsPage from './pages/ChatsPage';
import ChannelsPage from './pages/ChannelsPage';
import ChannelViewPage from './pages/ChannelViewPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Загрузка...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Загрузка...</div>;
  if (user) return <Navigate to="/chats" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/cabinet"
        element={
          <ProtectedRoute>
            <CabinetPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chats"
        element={
          <ProtectedRoute>
            <ChatsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/channels"
        element={
          <ProtectedRoute>
            <ChannelsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/channels/:id"
        element={
          <ProtectedRoute>
            <ChannelViewPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/chats" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppRoutes />
      </SocketProvider>
    </AuthProvider>
  );
}
