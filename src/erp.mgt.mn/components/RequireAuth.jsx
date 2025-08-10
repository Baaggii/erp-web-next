import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate, Outlet } from 'react-router-dom';

export default function RequireAuth() {
  const { user } = useContext(AuthContext);
  // While the profile is being loaded (`user` is undefined), render nothing to
  // avoid redirecting to the login page during a hard refresh.
  if (user === undefined) return null;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
