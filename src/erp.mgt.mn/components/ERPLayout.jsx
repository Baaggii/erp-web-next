// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import FormsPage from '../pages/Forms.jsx';
import ReportsPage from '../pages/Reports.jsx';
import UsersPage from '../pages/Users.jsx';
import SettingsPage from '../pages/Settings.jsx';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';
import GeneralLedger from '../windows/GeneralLedger.jsx';

/**
 * ERPLayout renders the header, sidebar and a Mosaic workspace where
 * modules open as independent windows. Clicking sidebar items opens the
 * corresponding window in the workspace. When no windows are open, the
 * workspace shows a placeholder message.
 */
export default function ERPLayout() {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const titleMap = {
    '/': 'Dashboard',
    '/forms': 'Forms',
    '/reports': 'Reports',
    '/users': 'Users',
    '/settings': 'Settings',
  };
  const windowTitle = titleMap[location.pathname] || 'ERP';

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  return (
    <div style={styles.container}>
      <Header user={user} onLogout={handleLogout} onOpen={openWindow} />
      <div style={styles.body}>
        <Sidebar />
        <MainWindow title={windowTitle}>
          <Outlet />
        </MainWindow>
      </div>
    </div>
  );
}

/** Header bar */
function Header({ user, onLogout, onOpen }) {
  return (
    <header style={styles.header}>
      <div style={styles.logoSection}>
        <img src="/assets/logo-small.png" alt="ERP Logo" style={styles.logoImage} />
        <span style={styles.logoText}>MyERP</span>
      </div>
      <nav style={styles.headerNav}>
        <button style={styles.navBtn} onClick={() => onOpen('gl')}>
          General Ledger
        </button>
        <button style={styles.navBtn} onClick={() => onOpen('po')}>
          Purchase Orders
        </button>
        <button style={styles.navBtn} onClick={() => onOpen('sales')}>
          Sales Dashboard
        </button>
        <button style={styles.navBtn} onClick={() => onOpen('glInquiry')}>
          General Ledger Inquiry Module
        </button>
      </nav>
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
  logoSection: { display: 'flex', alignItems: 'center', flex: '0 0 auto' },
  logoImage: { width: '24px', height: '24px', marginRight: '0.5rem' },
  logoText: { fontSize: '1.1rem', fontWeight: 'bold' },
  headerNav: { marginLeft: '2rem', flexGrow: 1 },
  navBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginRight: '0.75rem',
  },
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
