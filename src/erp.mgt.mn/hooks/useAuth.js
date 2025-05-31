import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function useAuth() {
  const { setUser } = useContext(AuthContext);

  async function login({ email, password }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json(); // { id, email }
      setUser(data);
      return data;
    } else if (res.status === 401) {
      const err = await res.json();
      throw new Error(err.message || 'Unauthorized');
    } else {
      const text = await res.text();
      throw new Error(text || 'Login failed');
    }
  }

async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  }


export async function fetchProfile() {
  const res = await fetch('/api/auth/me', {
    credentials: 'include'
  });
  if (!res.ok) {
    throw new Error('Not authenticated');
  }
  return { login, logout };
}