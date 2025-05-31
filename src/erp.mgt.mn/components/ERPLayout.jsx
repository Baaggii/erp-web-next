// src/erp.mgt.mn/components/Layout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

export default function Layout() {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/login');
  }

  return (
    <div className="erp-layout">
      {/* Top header */}
      <header className="erp-header">
        <h1>ERP</h1>
        <div style={{ marginLeft: 'auto' }}>
          {user ? (
            <>
              <span style={{ marginRight: '1rem' }}>{user.email}</span>
              <button onClick={handleLogout}>Logout</button>
            </>
          ) : null}
        </div>
      </header>

      <div className="erp-body">
        {/* Sidebar */}
        <nav className="erp-sidebar">
          <ul>
            <li><NavLink to="/" end>Dashboard</NavLink></li>
            <li><NavLink to="/users">Users</NavLink></li>
            <li><NavLink to="/companies">Companies</NavLink></li>
            {/* add more links */}
          </ul>
        </nav>

        {/* Main content area */}
        <main className="erp-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}