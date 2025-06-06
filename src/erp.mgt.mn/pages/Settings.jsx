// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';

export default function SettingsLayout() {
  return (
    <div style={styles.container}>
      <aside style={styles.menu}>
        <NavLink end to="/settings" style={styles.menuItem}>
          General
        </NavLink>
        <NavLink to="/settings/users" style={styles.menuItem}>
          Users
        </NavLink>
        <NavLink to="/settings/user-companies" style={styles.menuItem}>
          User Companies
        </NavLink>
        <NavLink to="/settings/role-permissions" style={styles.menuItem}>
          Role Permissions
        </NavLink>
        <NavLink to="/settings/change-password" style={styles.menuItem}>
          Change Password
        </NavLink>
      </aside>
      <div style={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}

export function GeneralSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch settings');
        return res.json();
      })
      .then((json) => setSettings(json))
      .catch((err) => console.error('Error fetching settings:', err));
  }, []);

  return (
    <div>
      <h2>Settings</h2>
      {settings ? (
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      ) : (
        <p>Loading settings…</p>
      )}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/settings/role-permissions">Edit Role Permissions</Link>
      </p>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100%'
  },
  menu: {
    width: '200px',
    padding: '0.5rem',
    borderRight: '1px solid #d1d5db'
  },
  menuItem: ({ isActive }) => ({
    display: 'block',
    padding: '0.4rem 0.5rem',
    color: isActive ? '#000' : '#374151',
    textDecoration: 'none',
    backgroundColor: isActive ? '#e5e7eb' : 'transparent',
    borderRadius: '3px',
    marginBottom: '0.25rem',
    fontSize: '0.9rem'
  }),
  content: {
    flexGrow: 1,
    padding: '1rem'
  }
};
