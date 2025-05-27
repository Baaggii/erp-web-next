import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({ user: null });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  // on mount, check session
  useEffect(() => {
    fetch('/erp/api/health', { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          // optionally /erp/api/me for full user
          setUser({}); // just truthy for now
        }
      });
  }, []);

  const login = async (identifier, password) => {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const { message } = await res.json().catch(() => ({}));
      throw new Error(message || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    nav('/dashboard');
  };

  const logout = async () => {
    await fetch('/erp/api/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    nav('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
