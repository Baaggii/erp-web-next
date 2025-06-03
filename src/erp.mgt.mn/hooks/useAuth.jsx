// src/erp.mgt.mn/hooks/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request, sets HttpOnly cookie on success.
 * @param {{email: string, password: string}} credentials
 */
export async function login({ email, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Ensures cookie is stored
    body: JSON.stringify({ email, password }),
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

