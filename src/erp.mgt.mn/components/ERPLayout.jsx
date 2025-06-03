// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext, useState } from 'react';
import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import FormsPage from '../pages/Forms.jsx';
import ReportsPage from '../pages/Reports.jsx';
import UsersPage from '../pages/Users.jsx';
import SettingsPage from '../pages/Settings.jsx';

/**
 * ERPLayout renders the header, sidebar and a Mosaic workspace where
 * modules open as independent windows. Clicking sidebar items opens the
 * corresponding window in the workspace. When no windows are open, the
 * workspace shows a placeholder message.
 */
export default function ERPLayout() {
  const { user, setUser } = useContext(AuthContext);
  const [layout, setLayout] = useState('dashboard');

  const windowMap = {
    dashboard: { title: 'Dashboard', Component: Dashboard },
    forms: { title: 'Forms', Component: FormsPage },
    reports: { title: 'Reports', Component: ReportsPage },
    users: { title: 'Users', Component: UsersPage },
    settings: { title: 'Settings', Component: SettingsPage },
  };

  function openWindow(id) {
    if (!layout) {
      setLayout(id);
    } else if (layout === id) {
      // already open
    } else {
      setLayout({ direction: 'row', first: layout, second: id, splitPercentage: 70 });
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  return (
    <div style={styles.container}>
      <Header user={user} onLogout={handleLogout} />
      <div style={styles.body}>
        <Sidebar onOpen={openWindow} />
        <div style={styles.workspace}>
          {layout ? (
            <Mosaic
              className="mosaic-blueprint-theme"
              value={layout}
              onChange={setLayout}
              renderTile={(id, path) => {
                const entry = windowMap[id];
                if (!entry) return null;
                const { title, Component } = entry;
                return (
                  <MosaicWindow title={title} path={path} toolbarControls={null}>
                    <Component />
                  </MosaicWindow>
                );
              }}
            />
          ) : (
            <div style={styles.empty}>No windows open</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header bar */
function Header({ user, onLogout }) {
  return (
    <header style={styles.header}>
      <div style={styles.logoSection}>
        <img src="/assets/logo-small.png" alt="ERP Logo" style={styles.logoImage} />
        <span style={styles.logoText}>MyERP</span>
      </div>
      <nav style={styles.headerNav}></nav>
      <div style={styles.userSection}>
        <span style={{ marginRight: '0.5rem' }}>{user ? `Welcome, ${user.email}` : ''}</span>
        {user && (
          <button style={styles.logoutBtn} onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </header>
  );
}

/** Sidebar menu */
function Sidebar({ onOpen }) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.menuGroup}>
        <div style={styles.groupTitle}>📌 Pinned</div>
        <button style={styles.menuItem} onClick={() => onOpen('dashboard')}>
          Dashboard
        </button>
        <button style={styles.menuItem} onClick={() => onOpen('forms')}>
          Forms
        </button>
        <button style={styles.menuItem} onClick={() => onOpen('reports')}>
          Reports
        </button>
      </div>
      <hr style={styles.divider} />
      <div style={styles.menuGroup}>
        <div style={styles.groupTitle}>📁 Modules</div>
        <button style={styles.menuItem} onClick={() => onOpen('users')}>
          Users
        </button>
        <button style={styles.menuItem} onClick={() => onOpen('settings')}>
          Settings
        </button>
      </div>
    </aside>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    color: '#fff',
    padding: '0 1rem',
    height: '48px',
    flexShrink: 0,
  },
  logoSection: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  logoImage: { width: '24px', height: '24px', marginRight: '0.5rem' },
  logoText: { fontSize: '1.1rem', fontWeight: 'bold' },
  headerNav: { marginLeft: '2rem', flexGrow: 1 },
  userSection: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  logoutBtn: {
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  body: { display: 'flex', flexGrow: 1, backgroundColor: '#f3f4f6' },
  sidebar: {
    width: '220px',
    backgroundColor: '#374151',
    color: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem 0.5rem',
    flexShrink: 0,
  },
  menuGroup: { marginBottom: '1rem' },
  groupTitle: { fontSize: '0.85rem', fontWeight: 'bold', margin: '0.5rem 0 0.25rem' },
  menuItem: {
    display: 'block',
    padding: '0.4rem 0.75rem',
    color: '#d1d5db',
    background: 'transparent',
    textDecoration: 'none',
    borderRadius: '3px',
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
  },
  divider: { border: 'none', borderTop: '1px solid #4b5563', margin: '0.5rem 0' },
  workspace: { flexGrow: 1, margin: '1rem', overflow: 'hidden' },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    border: '1px dashed #9ca3af',
    borderRadius: '4px',
    color: '#6b7280',
  },
};
