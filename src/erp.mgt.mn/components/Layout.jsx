import { NavLink, Outlet } from 'react-router-dom';
import LoginForm from './LoginForm.jsx';
import LogoutButton from './LogoutButton.jsx';
import MosaicLayout from './MosaicLayout.jsx';

export default function Layout() {
  return (
    <div className="app-grid">
      <nav className="sidebar">
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/forms">Forms</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/users">Users</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <LogoutButton />
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}