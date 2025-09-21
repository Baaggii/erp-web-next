// src/erp.mgt.mn/components/LogoutButton.jsx
import { useContext } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';    // <-- import the hook, not `logout` directly
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function LogoutButton() {
  const { user, setUser } = useContext(AuthContext);
  const { t } = useContext(I18nContext);

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
