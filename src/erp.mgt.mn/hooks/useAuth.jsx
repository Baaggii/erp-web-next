// src/erp.mgt.mn/hooks/useAuth.jsx
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

/**
 * useAuth hook:
 *   - login({ email, password })  → POST /api/auth/login (credentials included)
 *   - logout()                    → POST /api/auth/logout
 * Always uses credentials:'include' so that the HttpOnly cookie (erp_token) is sent.
 */
export function useAuth() {
  const { setUser } = useContext(AuthContext);

  // 1) login({ email, password }) → returns { id, email } on success (and sets cookie)
  async function login({ email, password }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json(); // e.g. { id: 3, email: 'admin@...' }
      setUser(data);
      return data;
    }

    if (res.status === 401) {
      const errJson = await res.json();
      throw new Error(errJson.message || 'Unauthorized');
    }

    const text = await res.text();
    throw new Error(text || 'Login failed');
  }

  // 2) logout() → POST /api/auth/logout, clears cookie
  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  }

  return { login, logout };
}

export async function fetchProfile() {
  const res = await fetch('/api/auth/me', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}