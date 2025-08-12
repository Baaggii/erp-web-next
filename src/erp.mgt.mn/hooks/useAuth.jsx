// src/erp.mgt.mn/hooks/useAuth.jsx
import { API_BASE } from '../utils/apiBase.js';

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request and sets an HttpOnly cookie on success.
 * Returns the authenticated user profile, session info and permissions.
 * @param {{empid: string, password: string}} credentials - empid refers to the employee login ID
 * @returns {Promise<{user: object, session: object, user_level: number, permissions: object}>}
*/
export async function login({ empid, password }) {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Ensures cookie is stored
    body: JSON.stringify({ empid, password }),
    });
  } catch (err) {
    // Network errors (e.g. server unreachable)
    throw new Error('Login request failed');
  }

  if (!res.ok) {
    let message = 'Login failed';
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      if (data && data.message) message = data.message;
    } else if (res.status === 503) {
      message = 'Service unavailable';
    } else {
      // Consume text to avoid unhandled promise rejections
      const text = await res.text().catch(() => '');
      if (text) message = text;
    }
    throw new Error(message);
  }

  return res.json();
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
 * @returns {Promise<{user: object, session: object, user_level: number, permissions: object}>}
*/
export async function fetchProfile() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

