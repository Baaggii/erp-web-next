import React, { useContext, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

export default function AppLayout({ children, title }) {
  const { user, session, department } = useContext(AuthContext);
  const { t } = useContext(I18nContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: AppLayout');
  }, []);

  const departmentDisplay = useMemo(() => {
    const candidates = [
      session?.department_name,
      session?.departmentLabel,
      session?.department_label,
      session?.department,
      session?.department_id,
    ];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const text = typeof candidate === 'string' ? candidate.trim() : String(candidate).trim();
      if (text.length > 0) return text;
    }
    if (department !== undefined && department !== null) {
      const text = String(department).trim();
      if (text.length > 0) return text;
    }
    return null;
  }, [session, department]);

  async function handleLogout() {
    await logout(user?.empid);
    navigate('/login');
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-800 text-white fixed top-0 left-0 h-screen overflow-y-auto flex-shrink-0 z-10">
        <nav className="p-4 space-y-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            {t('dashboard', 'Dashboard')}
          </NavLink>
          <NavLink
            to="/finance-transactions"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            {t('financeTransactions', 'Finance Transactions')}
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              `block px-3 py-2 rounded hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`
            }
          >
            {t('reports', 'Reports')}
          </NavLink>
        </nav>
      </aside>
      <div className="flex flex-col flex-grow min-w-0 ml-64">
        <header className="sticky top-0 z-10 bg-white shadow-md flex items-center justify-between px-4 py-2">
          <h1 className="text-lg font-semibold">{title || t('erp', 'ERP')}</h1>
          <div className="flex items-center space-x-3 text-sm">
            {session && (
              <span>
                {session.company_name}
                {departmentDisplay && ` | ${departmentDisplay}`}
                {session.branch_name && ` | ${session.branch_name}`}
                {session.user_level_name && ` | ${session.user_level_name}`}
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
                      {t('logout', 'Logout')}
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
