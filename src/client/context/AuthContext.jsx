// File: src/client/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({ user: null, login: async ()=>{}, logout: ()=>{} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  // On mount, check for existing cookie / valid session
  useEffect(() => {
    fetch('/erp/api/auth/health', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.status === 'ok') {
          // we know the session exists, now fetch full user
          return fetch('/erp/api/auth/me', { credentials: 'include' });
        }
        throw new Error('Not authenticated');
      })
      .then(r => r.json())
      .then(j => setUser(j.user))
      .catch(() => setUser(null));
  }, []);

  // login() calls the API, sets cookie, sets user, navigates
  const login = async (identifier, password) => {
    const res = await fetch('/erp/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) throw new Error((await res.json()).message);
    const { user: u } = await res.json();
    setUser(u);
    nav('/dashboard');
  };

  const logout = async () => {
    await fetch('/erp/api/auth/logout', {
      method:'POST', credentials:'include'
    });
    setUser(null);
    nav('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
