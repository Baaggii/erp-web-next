// File: src/client/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({
  user: null,
  login: async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // On mount: check session & fetch full user profile if logged in
  useEffect(() => {
    async function initAuth() {
      try {
        const health = await fetch('/erp/api/health', {
          credentials: 'include'
        });
        if (health.ok) {
          // session valid → fetch profile
          const meRes = await fetch('/erp/api/users/me', {
            credentials: 'include'
          });
          if (meRes.ok) {
            const profile = await meRes.json();
            setUser(profile);
          }
        }
      } catch (err) {
        console.error('Auth init failed', err);
      }
    }
    initAuth();
  }, []);

  // Call this from your Login form
  async function login(email, password) {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const { message, error } = await res.json().catch(() => ({}));
      throw new Error(message || error || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    navigate('/dashboard');
  }

  // Call this to log out
  async function logout() {
    await fetch('/erp/api/logout', {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
    navigate('/login');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to access auth context
export function useAuth() {
  return useContext(AuthContext);
}
