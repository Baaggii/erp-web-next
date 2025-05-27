// File: src/client/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({ user: null, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  // on mount: validate session & fetch /me
  useEffect(() => {
    (async function init() {
      const h = await fetch('/erp/api/health', { credentials:'include' });
      if (h.ok) {
        const me = await fetch('/erp/api/users/me', { credentials:'include' });
        if (me.ok) setUser(await me.json());
      }
    })();
  }, []);

  async function login(identifier, password) {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({}));
      throw new Error(err.message || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    nav('/dashboard');
  }

  async function logout() {
    await fetch('/erp/api/logout', { method:'POST', credentials:'include' });
    setUser(null);
    nav('/login');
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
