import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate, Outlet } from 'react-router-dom';

export default function RequireAdmin() {
  const { user } = useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return user.session?.permissions?.developer ? <Outlet /> : <Navigate to="/" replace />;
}
