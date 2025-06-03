// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

export default function ERPLayout() {
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleLogout() {
    // 1) Call your backend logout endpoint if you have one:
    await logout();

    // 2) Clear user from context and redirect to /login
    setUser(null);
    navigate('/login');
  }

  return (
    <div className="erp-layout">
      <header>
        <h1>My ERP</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>
      <nav>
        <ul>
          <li>
            <NavLink to="/" end>Dashboard</NavLink>
          </li>
          <li>
            <NavLink to="/users">Users</NavLink>
          </li>
          <li>
            <NavLink to="/reports">Reports</NavLink>
          </li>
          <li>
            <NavLink to="/settings">Settings</NavLink>
          </li>
        </ul>
      </nav>

      <main>
        {/* Nested routes will render here */}
        <Outlet />
      </main>
    </div>
  );
}
