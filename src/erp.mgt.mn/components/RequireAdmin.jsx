import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate, Outlet } from 'react-router-dom';

export default function RequireAdmin() {
  const { user, session } = useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return session?.permissions?.system_settings ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  );
}
