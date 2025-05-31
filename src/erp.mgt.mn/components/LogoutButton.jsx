// src/erp.mgt.mn/components/LogoutButton.jsx
import { useContext } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';    // <-- import the hook, not `logout` directly
import { AuthContext } from '../context/AuthContext.jsx';

export default function LogoutButton() {
  const { user, setUser } = useContext(AuthContext);

  // Destructure `logout` from the hook:
  const { logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  if (!user) return null;

  return (
    <button onClick={handleLogout}>
      Logout
    </button>
  );
}
