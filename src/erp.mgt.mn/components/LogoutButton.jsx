// src/erp.mgt.mn/components/LogoutButton.jsx
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.jsx';    // <-- import the hook, not `logout` directly
import { AuthContext } from '../context/AuthContext.jsx';

export default function LogoutButton() {
  const { user, setUser } = useContext(AuthContext);
  const { t } = useTranslation();

  // Destructure `logout` from the hook:
  const { logout } = useAuth();

  async function handleLogout() {
    try {
      await logout(user?.empid);
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  if (!user) return null;

  return (
    <button onClick={handleLogout}>
      {t('logout', 'Logout')}
    </button>
  );
}
