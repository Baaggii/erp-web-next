// src/erp.mgt.mn/hooks/useAuth.jsx
import { API_BASE } from '../utils/apiBase.js';
import normalizeEmploymentSession from '../utils/normalizeEmploymentSession.js';

function normalizeNumericId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request and sets an HttpOnly cookie on success.
 * If multiple companies are configured for the user, the response will
 * include a `needsCompany` flag with available sessions.
 * @param {{empid: string, password: string, companyId?: number}} credentials
 * @returns {Promise<any>}
*/
export async function login({ empid, password, companyId }, t = (key, fallback) => fallback || key) {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Ensures cookie is stored
      body: JSON.stringify({ empid, password, companyId }),
    });
  } catch (err) {
    // Network errors (e.g. server unreachable)
    throw new Error(t('loginRequestFailed', 'Login request failed'));
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    let message = t('loginFailed', 'Login failed');
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (data && data.message) message = data.message;
    } else if (res.status === 503) {
      message = t('serviceUnavailable', 'Service unavailable');
    } else {
      message = res.statusText || message;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const normalizedSession = normalizeEmploymentSession(data?.session);
  const nextData = normalizedSession ? { ...data, session: normalizedSession } : data;
  if (nextData?.session) {
    try {
      const stored = JSON.parse(localStorage.getItem('erp_session_ids') || '{}');
      const workplaceSessionId = normalizeNumericId(
        nextData.session?.workplace_session_id,
      );
      const workplaceId =
        workplaceSessionId !== null
          ? normalizeNumericId(
              nextData.workplace ?? nextData.session?.workplace_id,
            )
          : null;
      const workplaceSessionIds = Array.isArray(
        nextData.session?.workplace_session_ids,
      )
        ? nextData.session.workplace_session_ids
            .map((value) => normalizeNumericId(value))
            .filter((value) => value !== null)
        : [];
      if (nextData.session.senior_empid) {
        stored.senior_empid = nextData.session.senior_empid;
      } else {
        delete stored.senior_empid;
      }
      if (nextData.session.senior_plan_empid) {
        stored.senior_plan_empid = nextData.session.senior_plan_empid;
      } else {
        delete stored.senior_plan_empid;
      }
      if (workplaceSessionId !== null) {
        stored.workplace_session_id = workplaceSessionId;
        if (workplaceId !== null) {
          stored.workplace = workplaceId;
        } else {
          delete stored.workplace;
        }
        if (workplaceSessionIds.length) {
          stored.workplace_session_ids = workplaceSessionIds;
        } else {
          delete stored.workplace_session_ids;
        }
      } else {
        delete stored.workplace_session_id;
        delete stored.workplace_session_ids;
        delete stored.workplace;
      }
      localStorage.setItem('erp_session_ids', JSON.stringify(stored));
    } catch {
      /* ignore storage errors */
    }
  }
  return nextData;
}

/**
 * Calls the logout endpoint to clear the JWT cookie. Any additional cleanup
 * is handled by the `auth:logout` event listener in `AuthContext` so that the
 * logic remains centralised.
 */
export async function logout(empid) {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  // Notify the AuthContext that a logout occurred so that it can reset state.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    const evt = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:logout')
      : { type: 'auth:logout' };
    window.dispatchEvent(evt);
  }
}

/**
 * Fetches current user profile if authenticated.
 * @returns {Promise<{id: number, empid: string, position: string}>}
*/
export async function fetchProfile(t = (key, fallback) => fallback || key) {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) throw new Error(t('notAuthenticated', 'Not authenticated'));
  const data = await res.json();
  const normalizedSession = normalizeEmploymentSession(data?.session);
  const nextData = normalizedSession ? { ...data, session: normalizedSession } : data;
  if (nextData?.session) {
    try {
      const stored = JSON.parse(localStorage.getItem('erp_session_ids') || '{}');
      const workplaceSessionId = normalizeNumericId(
        nextData.session?.workplace_session_id,
      );
      const workplaceId =
        workplaceSessionId !== null
          ? normalizeNumericId(
              nextData.workplace ?? nextData.session?.workplace_id,
            )
          : null;
      const workplaceSessionIds = Array.isArray(
        nextData.session?.workplace_session_ids,
      )
        ? nextData.session.workplace_session_ids
            .map((value) => normalizeNumericId(value))
            .filter((value) => value !== null)
        : [];
      if (nextData.session.senior_empid) {
        stored.senior_empid = nextData.session.senior_empid;
      } else {
        delete stored.senior_empid;
      }
      if (nextData.session.senior_plan_empid) {
        stored.senior_plan_empid = nextData.session.senior_plan_empid;
      } else {
        delete stored.senior_plan_empid;
      }
      if (workplaceSessionId !== null) {
        stored.workplace_session_id = workplaceSessionId;
        if (workplaceId !== null) {
          stored.workplace = workplaceId;
        } else {
          delete stored.workplace;
        }
        if (workplaceSessionIds.length) {
          stored.workplace_session_ids = workplaceSessionIds;
        } else {
          delete stored.workplace_session_ids;
        }
      } else {
        delete stored.workplace_session_id;
        delete stored.workplace_session_ids;
        delete stored.workplace;
      }
      localStorage.setItem('erp_session_ids', JSON.stringify(stored));
    } catch {
      /* ignore storage errors */
    }
  }
  return nextData;
}

