import { useContext } from 'react';
import { logout } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

export default function LogoutButton() {
  const { setUser } = useContext(AuthContext);
  async function handleLogout() {
    await logout(); setUser(null);
  }
  return <button onClick={handleLogout}>Log Out</button>;
}