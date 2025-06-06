import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate, Outlet } from 'react-router-dom';

export default function RequireAuth() {
  const { user, loading } = useContext(AuthContext);
  if (loading) {
    return <p>Loading…</p>;
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
