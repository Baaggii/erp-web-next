// File: src/client/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  // On mount, validate cookie + fetch /me
  useEffect(() => {
    fetch('/erp/api/health', { credentials:'include' })
      .then(r => {
        if (!r.ok) throw new Error();
        return fetch('/erp/api/users/me', { credentials:'include' });
      })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // login(empid,password)
  const login = async (empid, password) => {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials:'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ empid, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({message:'Login failed'}));
      throw new Error(err.message||'Login failed');
    }
    const { user } = await res.json();
    setUser(user);
    nav('/dashboard', { replace:true });
  };

  // logout
  const logout = async () => {
    await fetch('/erp/api/logout', {
      method:'POST',
      credentials:'include'
    });
    setUser(null);
    nav('/login', { replace:true });
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
