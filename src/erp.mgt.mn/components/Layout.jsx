import { NavLink, Outlet } from 'react-router-dom';
import LogoutButton from './LogoutButton.jsx';
import UserProfile from './UserProfile.jsx';
import LicenseConfigLink from './LicenseConfigLink.jsx';  // Custom link to license configuration

export default function Layout() {
  return (
    <div className="app-grid">
      <header className="topbar">
        <h1 className="logo">ERP Portal</h1>
        <UserProfile />  {/* Show current user info */}
      </header>

      <nav className="sidebar">
        <NavLink to="/" className="nav-link">Dashboard</NavLink>
        <NavLink to="/forms" className="nav-link">Forms</NavLink>
        <NavLink to="/reports" className="nav-link">Reports</NavLink>
        <NavLink to="/users" className="nav-link">Users</NavLink>
        <NavLink to="/settings" className="nav-link">Settings</NavLink>
        <NavLink to="/main-user/licenses" className="nav-link">Licenses</NavLink>
        <NavLink to="/main-user/settings" className="nav-link">Main User Settings</NavLink>
        <LicenseConfigLink />  {/* Advanced module toggling */}
        <LogoutButton className="logout-button" />
      </nav>

      <main className="content">
        <div className="breadcrumbs">Home / Dashboard</div>  {/* Breadcrumbs */}
        <Outlet />  {/* Renders the active route */}
      </main>

      <footer className="footer">
        <small>&copy; {new Date().getFullYear()} Your Company. All rights reserved.</small>
      </footer>
    </div>
  );
}