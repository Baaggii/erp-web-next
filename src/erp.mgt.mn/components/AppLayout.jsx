import React, { useContext, useEffect, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';
import { logout } from '../hooks/useAuth.jsx';

export default function AppLayout({ children, title }) {
  const { user, session } = useContext(AuthContext);
  const { t } = useContext(I18nContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: AppLayout');
  }, []);

  async function handleLogout() {
    await logout(user?.empid);
    navigate('/login');
  }

  const { workplaceSummaries, workplaceIds } = useMemo(() => {
    if (!session) {
      return { workplaceSummaries: [], workplaceIds: [] };
    }

    const assignments = Array.isArray(session.workplace_assignments)
      ? session.workplace_assignments
      : [];

    const seenAssignments = new Set();
    const knownSessionIds = new Set();
    const workplaceIdSet = new Set();
    const summaries = [];

    const parseId = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      }
      return null;
    };

    const collectWorkplaceId = (value) => {
      const parsed = parseId(value);
      if (parsed != null) {
        workplaceIdSet.add(parsed);
      }
    };

    const pushSummary = (label) => {
      if (!label) return;
      if (summaries.includes(label)) return;
      summaries.push(label);
    };

    const formatAssignment = (assignment) => {
      if (!assignment || typeof assignment !== 'object') return null;

      const workplaceId =
        assignment.workplace_id !== undefined
          ? assignment.workplace_id
          : assignment.workplaceId;
      const workplaceSessionId =
        assignment.workplace_session_id !== undefined
          ? assignment.workplace_session_id
          : assignment.workplaceSessionId;

      const normalizedWorkplaceId = parseId(workplaceId);
      const normalizedSessionId = parseId(workplaceSessionId);

      const key = `${normalizedWorkplaceId ?? ''}|${normalizedSessionId ?? ''}`;
      if (seenAssignments.has(key)) return null;
      seenAssignments.add(key);

      if (normalizedWorkplaceId != null) {
        collectWorkplaceId(normalizedWorkplaceId);
      }

      const labelParts = [];
      const baseName = assignment.workplace_name
        ? String(assignment.workplace_name).trim()
        : '';
      if (baseName) {
        labelParts.push(baseName);
      }

      const idParts = [];
      if (normalizedWorkplaceId != null) {
        idParts.push(`#${normalizedWorkplaceId}`);
      }
      if (
        normalizedSessionId != null &&
        normalizedSessionId !== normalizedWorkplaceId
      ) {
        idParts.push(`session ${normalizedSessionId}`);
      }
      if (idParts.length) {
        labelParts.push(idParts.join(' · '));
      }

      const contextParts = [];
      if (assignment.department_name) {
        contextParts.push(String(assignment.department_name).trim());
      }
      if (assignment.branch_name) {
        contextParts.push(String(assignment.branch_name).trim());
      }
      if (contextParts.length) {
        labelParts.push(contextParts.join(' / '));
      }

      if (!labelParts.length) {
        const fallbackId = normalizedSessionId ?? normalizedWorkplaceId;
        if (fallbackId != null) {
          labelParts.push(`Session ${fallbackId}`);
        }
      }

      const label = labelParts.join(' – ');
      if (!label) return null;

      const sessionId =
        normalizedSessionId ?? normalizedWorkplaceId ?? null;

      if (sessionId != null) {
        knownSessionIds.add(sessionId);
      }

      return label;
    };

    assignments.forEach((assignment) => {
      const label = formatAssignment(assignment);
      if (label) {
        pushSummary(label);
      }
    });

    const normalizedSessionIds = [];
    const pushNormalizedId = (value) => {
      const parsed = parseId(value);
      if (parsed != null && !normalizedSessionIds.includes(parsed)) {
        normalizedSessionIds.push(parsed);
      }
    };

    pushNormalizedId(session.workplace_session_id);
    if (Array.isArray(session.workplace_session_ids)) {
      session.workplace_session_ids.forEach(pushNormalizedId);
    }

    normalizedSessionIds.forEach((sessionId) => {
      if (knownSessionIds.has(sessionId)) return;
      knownSessionIds.add(sessionId);
      pushSummary(`Session ${sessionId}`);
    });

    collectWorkplaceId(session.workplace_id);
    collectWorkplaceId(session.workplaceId);
    collectWorkplaceId(session.workplace);
    if (Array.isArray(session.workplace_ids)) {
      session.workplace_ids.forEach(collectWorkplaceId);
    }

    if (!summaries.length) {
      const fallbackLabel = formatAssignment({
        workplace_id: session.workplace_id ?? null,
        workplace_session_id:
          session.workplace_session_id ?? session.workplace_id ?? null,
        workplace_name: session.workplace_name ?? null,
        department_name: session.department_name ?? null,
        branch_name: session.branch_name ?? null,
      });
      if (fallbackLabel) {
        pushSummary(fallbackLabel);
      }
    }

    const workplaceIds = Array.from(workplaceIdSet).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );

    return { workplaceSummaries: summaries, workplaceIds };
  }, [session]);

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
              <div className="flex flex-col text-right leading-tight">
                <span>
                  {session.company_name}
                  {session.department_name && ` | ${session.department_name}`}
                  {session.branch_name && ` | ${session.branch_name}`}
                  {session.user_level_name && ` | ${session.user_level_name}`}
                </span>
                {workplaceSummaries.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {workplaceSummaries.join(' • ')}
                  </span>
                )}
                {workplaceIds.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {t('workplaceIds', 'Workplace IDs')}: {workplaceIds.join(', ')}
                  </span>
                )}
              </div>
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
