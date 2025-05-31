// src/erp.mgt.mn/hooks/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// src/erp.mgt.mn/hooks/useAuth.jsx

/**
 * Performs a login request, sets HttpOnly cookie on success.
 * @param {{email: string, password: string}} credentials
 */
export async function login({ email, password }) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // ← tell the browser to save the cookie
      body: JSON.stringify({ email, password }),
    });
    return res.ok;
  } catch (err) {
    console.error('Login failed:', err);
    return false;
  }
}

/**
 * Calls logout endpoint to clear the JWT cookie.
 */
export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.error('Logout failed:', err);
  }
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