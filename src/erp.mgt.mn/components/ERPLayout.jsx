// src/erp.mgt.mn/components/ERPLayout.jsx
import { useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

export default function ERPLayout() {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  return (
    <div style={styles.container}>
      {/* ===== Top header bar ===== */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>ERP Dashboard</h1>
        </div>
        <div style={styles.headerRight}>
          {user?.email && (
            <span style={styles.userEmail}>Logged in as: {user.email}</span>
          )}
          <button style={styles.logoutButton} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* ===== Main area: sidebar + content ===== */}
      <div style={styles.main}>
        {/* Sidebar */}
        <nav style={styles.sidebar}>
          <ul style={styles.navList}>
            <li>
              <NavLink
                to="/"
                style={({ isActive }) =>
                  isActive ? styles.navItemActive : styles.navItem
                }
              >
                Home
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/users"
                style={({ isActive }) =>
                  isActive ? styles.navItemActive : styles.navItem
                }
              >
                Users
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/companies"
                style={({ isActive }) =>
                  isActive ? styles.navItemActive : styles.navItem
                }
              >
                Companies
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/settings"
                style={({ isActive }) =>
                  isActive ? styles.navItemActive : styles.navItem
                }
              >
                Settings
              </NavLink>
            </li>
            {/* …add more sidebar links here… */}
          </ul>
        </nav>

        {/* Content area: <Outlet /> renders whichever child route is active */}
        <section style={styles.content}>
          <Outlet />
        </section>
      </div>
    </div>
  );
}

// Simple inline styles for demonstration.
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    height: '60px',
    backgroundColor: '#003366',
    color: '#FFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  userEmail: {
    marginRight: '15px',
    fontSize: '0.9rem',
  },
  logoutButton: {
    padding: '6px 12px',
    backgroundColor: '#FF3333',
    border: 'none',
    borderRadius: '4px',
    color: '#FFF',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: '200px',
    backgroundColor: '#F4F4F4',
    borderRight: '1px solid #DDD',
    padding: '10px 0',
    overflowY: 'auto',
  },
  navList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  navItem: {
    display: 'block',
    padding: '10px 20px',
    textDecoration: 'none',
    color: '#333',
  },
  navItemActive: {
    display: 'block',
    padding: '10px 20px',
    textDecoration: 'none',
    color: '#003366',
    fontWeight: 'bold',
    backgroundColor: '#E0E0E0',
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
    backgroundColor: '#FFF',
  },
};
