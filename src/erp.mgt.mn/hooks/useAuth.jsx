// src/erp.mgt.mn/hooks/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request and sets an HttpOnly cookie on success.
 * If multiple companies are configured for the user, the response will
 * include a `needsCompany` flag with available sessions.
 * @param {{empid: string, password: string, companyId?: number}} credentials
 * @returns {Promise<any>}
*/
export async function login({ empid, password, companyId }) {
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
    throw new Error('Login request failed');
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    let message = 'Login failed';
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (data && data.message) message = data.message;
    } else if (res.status === 503) {
      message = 'Service unavailable';
    } else {
      message = res.statusText || message;
    }
    throw new Error(message);
  }

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

/**
 * Calls logout endpoint to clear the JWT cookie.
 */
export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Fetches current user profile if authenticated.
 * @returns {Promise<{id: number, empid: string, position: string}>}
*/
export async function fetchProfile() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) throw new Error('Not authenticated');
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

