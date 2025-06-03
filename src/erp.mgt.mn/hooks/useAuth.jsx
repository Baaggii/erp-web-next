// src/erp.mgt.mn/hooks/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request, sets HttpOnly cookie on success.
 * @param {{userId: string, password: string}} credentials - userId refers to the employee login ID
 */
 * @param {{identifier: string, password: string}} credentials - identifier can be employee ID or email
 */
export async function login({ identifier, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Ensures cookie is stored
    // Backend accepts email field which can be either an email or empid
    body: JSON.stringify({ email: identifier, password }),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || 'Login failed');
  }
  return res.json();
}

/**
 * Calls logout endpoint to clear the JWT cookie.
 */
export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * Fetches current user profile if authenticated.
 * @returns {Promise<{id: number, email: string}>}
 */
export async function fetchProfile() {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

