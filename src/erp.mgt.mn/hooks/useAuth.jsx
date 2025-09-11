// src/erp.mgt.mn/hooks/useAuth.jsx
import { API_BASE } from '../utils/apiBase.js';

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
    // Retrieve CSRF token first so that the login request can include it
    const tokenRes = await fetch(`${API_BASE}/csrf-token`, {
      credentials: 'include',
    });
    if (!tokenRes.ok) {
      throw new Error(tokenRes.statusText || 'csrf');
    }

    const tokenType = tokenRes.headers.get('content-type') || '';
    if (!tokenType.includes('application/json')) {
      throw new Error(t('loginRequestFailed', 'Login request failed'));
    }
    const tokenData = await tokenRes.json().catch(() => ({}));
    const csrfToken = tokenData?.csrfToken;

    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include', // Ensures cookie is stored
      body: JSON.stringify({ empid, password, companyId }),
    });
  } catch (err) {
    // Network errors (e.g. server unreachable)
    const message = err?.message || t('loginRequestFailed', 'Login request failed');
    throw new Error(message);
  }

  const dataType = res.headers.get('content-type') || '';
  const raw = await res.text();

  if (!res.ok) {
    let message = t('loginFailed', 'Login failed');
    if (dataType.includes('application/json')) {
      try {
        const data = JSON.parse(raw);
        if (data && data.message) message = data.message;
      } catch {
        // fall through with default message
      }
    } else if (res.status === 503) {
      message = t('serviceUnavailable', 'Service unavailable');
    } else {
      message = raw || res.statusText || message;
    }
    throw new Error(message);
  }

  let data;
  if (dataType.includes('application/json')) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(raw || t('loginRequestFailed', 'Login request failed'));
    }
  } else {
    throw new Error(raw || t('loginRequestFailed', 'Login request failed'));
  }
  if (data?.session) {
    try {
      const stored = JSON.parse(localStorage.getItem('erp_session_ids') || '{}');
      if (data.session.senior_empid) {
        stored.senior_empid = data.session.senior_empid;
      } else {
        delete stored.senior_empid;
      }
      localStorage.setItem('erp_session_ids', JSON.stringify(stored));
    } catch {
      /* ignore storage errors */
    }
  }
  return data;
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
  if (data?.session) {
    try {
      const stored = JSON.parse(localStorage.getItem('erp_session_ids') || '{}');
      if (data.session.senior_empid) {
        stored.senior_empid = data.session.senior_empid;
      } else {
        delete stored.senior_empid;
      }
      localStorage.setItem('erp_session_ids', JSON.stringify(stored));
    } catch {
      /* ignore storage errors */
    }
  }
  return data;
}

