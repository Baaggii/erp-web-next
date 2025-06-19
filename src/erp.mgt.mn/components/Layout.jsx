// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

/**
 * A desktop‐style “ERPLayout” with:
 *  - Top header bar (logo, nav icons, user dropdown)
 *  - Left sidebar (menu groups + items)
 *  - Main content area (faux window container)
 */
export default function ERPLayout() {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const titleMap = {
    '/': 'Dashboard',
    '/forms': 'Forms',
    '/reports': 'Reports',
    '/settings': 'Settings',
    '/settings/users': 'Users',
    '/settings/user-companies': 'User Companies',
    '/settings/role-permissions': 'Role Permissions',
    '/settings/change-password': 'Change Password',
  };
  const windowTitle = titleMap[location.pathname] || 'ERP';

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/login');
  }

  return (
    <div style={styles.container}>
      <Header user={user} onLogout={handleLogout} />
      <div style={styles.body}>
        <Sidebar />
        <MainWindow title={windowTitle}>
          <Outlet />
        </MainWindow>
      </div>
    </div>
  );
}

/** Top header bar **/
function Header({ user, onLogout }) {
  return (
    <header style={styles.header}>
      <div style={styles.logoSection}>
        <img
          src="/assets/logo‐small.png"
          alt="ERP Logo"
          style={styles.logoImage}
        />
        <span style={styles.logoText}>MyERP</span>
      </div>
      <nav style={styles.headerNav}>
        <button style={styles.iconBtn}>🗔 Home</button>
        <button style={styles.iconBtn}>🗗 Windows</button>
        <button style={styles.iconBtn}>❔ Help</button>
      </nav>
      <div style={styles.userSection}>
        <span style={{ marginRight: '0.5rem' }}>
          {user ? `Welcome, ${user.empid}` : ''}
        </span>
        {user && (
          <button style={styles.logoutBtn} onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </header>
  );
}

/** Left sidebar with “menu groups” and “pinned items” **/
function Sidebar() {
  const { user } = useContext(AuthContext);

  // You can expand/collapse these groups if you like; this is a static example
  return (
    <aside className="sidebar" style={styles.sidebar}>
      <div style={styles.menuGroup}>
        <div style={styles.groupTitle}>📌 Pinned</div>
        <NavLink to="/" style={styles.menuItem}>
          Dashboard
        </NavLink>
        <NavLink to="/forms" style={styles.menuItem}>
          Forms
        </NavLink>
        <NavLink to="/reports" style={styles.menuItem}>
          Reports
        </NavLink>
      </div>

      <hr style={styles.divider} />

      <div style={styles.menuGroup}>
        <div style={styles.groupTitle}>⚙ Settings</div>
        <NavLink to="/settings" style={styles.menuItem} end>
          General
        </NavLink>
        {user?.role === 'admin' && (
          <>
            <NavLink to="/settings/users" style={styles.menuItem}>
              Users
            </NavLink>
            <NavLink to="/settings/user-companies" style={styles.menuItem}>
              User Companies
            </NavLink>
            <NavLink to="/settings/role-permissions" style={styles.menuItem}>
              Role Permissions
            </NavLink>
            <NavLink to="/settings/modules" style={styles.menuItem}>
              Modules
            </NavLink>
          </>
        )}
        <NavLink to="/settings/change-password" style={styles.menuItem}>
          Change Password
        </NavLink>
      </div>
    </aside>
  );
}

/** A faux “window” wrapper around the main content **/
function MainWindow({ children, title }) {
  return (
    <div style={styles.windowContainer}>
      <div style={styles.windowHeader}>
        <span>{title}</span>
        <div>
          <button style={styles.windowHeaderBtn}>–</button>
          <button style={styles.windowHeaderBtn}>□</button>
          <button style={styles.windowHeaderBtn}>×</button>
        </div>
      </div>
      <div style={styles.windowContent}>{children}</div>
    </div>
  );
}

/** Inline styles (you can move these into a `.css` or Tailwind classes if you prefer) **/
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
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    flex: '0 0 auto',
  },
  logoImage: {
    width: '24px',
    height: '24px',
    marginRight: '0.5rem',
  },
  logoText: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
  },
  headerNav: {
    marginLeft: '2rem',
    display: 'flex',
    gap: '0.75rem',
    flexGrow: 1,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '0.25rem 0.5rem',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    flex: '0 0 auto',
  },
  logoutBtn: {
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  body: {
    display: 'flex',
    flexGrow: 1,
    backgroundColor: '#f3f4f6',
  },
  sidebar: {
    backgroundColor: '#374151',
    color: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    width: '240px',
    overflowY: 'auto',
    padding: '1rem',
    flexShrink: 0,
    gap: '0.5rem',
  },
  menuGroup: {
    marginBottom: '1rem',
  },
  groupTitle: {
    fontSize: '0.85rem',
    fontWeight: 'bold',
    margin: '0.5rem 0 0.25rem 0',
  },
  menuItem: ({ isActive }) => ({
    display: 'block',
    padding: '0.4rem 0.75rem',
    color: isActive ? '#ffffff' : '#d1d5db',
    backgroundColor: isActive ? '#4b5563' : 'transparent',
    textDecoration: 'none',
    borderRadius: '3px',
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
  }),
  divider: {
    border: 'none',
    borderTop: '1px solid #4b5563',
    margin: '0.5rem 0',
  },
  windowContainer: {
    flexGrow: 1,
    margin: '1rem',
    border: '1px solid #9ca3af',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  windowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6b7280',
    color: '#f9fafb',
    padding: '0.5rem 1rem',
    borderTopLeftRadius: '4px',
    borderTopRightRadius: '4px',
    fontSize: '0.95rem',
  },
  windowHeaderBtn: {
    marginLeft: '0.5rem',
    background: 'transparent',
    border: 'none',
    color: '#f9fafb',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  windowContent: {
    flexGrow: 1,
    padding: '1rem',
    overflow: 'auto',
  },
};
