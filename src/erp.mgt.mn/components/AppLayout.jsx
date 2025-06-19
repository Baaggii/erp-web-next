import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

export default function AppLayout({ children, title }) {
  const { user, company } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-800 text-white sticky top-0 h-screen overflow-y-auto flex-shrink-0">
        <nav className="p-4 space-y-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            Самбар
          </NavLink>
          <NavLink
            to="/finance-transactions"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            Санхүүгийн гүйлгээ
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            Тайлан
          </NavLink>
        </nav>
      </aside>
      <div className="flex flex-col flex-grow min-w-0">
        <header className="sticky top-0 z-10 bg-white shadow-md flex items-center justify-between px-4 py-2">
          <h1 className="text-lg font-semibold">{title || 'ERP'}</h1>
          <div className="flex items-center space-x-3 text-sm">
            {company && (
              <span>
                {company.branch_name && `${company.branch_name} | `}
                {company.company_name}
              </span>
            )}
            {user && (
              <div className="relative group">
                <button className="focus:outline-none">{user.empid}</button>
                <ul className="account-menu absolute right-0 mt-2 hidden group-focus-within:block group-hover:block">
                  <li>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2"
                    >
                      Logout
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </header>
        <main className="flex-grow overflow-auto p-4 bg-gray-100">{children}</main>
      </div>
    </div>
  );
}
