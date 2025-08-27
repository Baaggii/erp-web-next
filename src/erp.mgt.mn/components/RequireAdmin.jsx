import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate, Outlet } from 'react-router-dom';

export default function RequireAdmin() {
  const { user, session, permissions } = useContext(AuthContext);
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return hasAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
