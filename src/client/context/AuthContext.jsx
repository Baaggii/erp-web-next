// File: src/client/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({
  user: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // On mount: validate existing session & fetch profile
  useEffect(() => {
    fetch('/erp/api/health', {
      credentials: 'include',
    })
      .then(res => {
        if (!res.ok) throw new Error('Not authenticated');
        return fetch('/erp/api/users/me', { credentials: 'include' });
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load user');
        return res.json();
      })
      .then(profile => {
        setUser(profile);
      })
      .catch(() => {
        setUser(null);
      });
  }, []);

  // identifier may be employee‐ID or email, depending on your backend
  const login = async (identifier, password) => {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    navigate('/dashboard', { replace: true });
  };

  const logout = async () => {
    await fetch('/erp/api/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// custom hook for easy context access
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
