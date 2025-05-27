// File: src/client/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate }                        from 'react-router-dom';

const AuthContext = createContext({
  user:   null,
  login:  async () => {},
  logout: async () => {}
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const navigate        = useNavigate();

  // On mount: validate session & pull full profile
  useEffect(() => {
    (async () => {
      try {
        const h = await fetch('/erp/api/health', { credentials:'include' });
        if (!h.ok) return;
        const meRes = await fetch('/erp/api/users/me', { credentials:'include' });
        if (meRes.ok) {
          setUser(await meRes.json());
        }
      } catch(err) {
        console.error('Auth init failed', err);
      }
    })();
  }, []);

  // identifier can be empid or email
  async function login(identifier, password) {
    const res = await fetch('/erp/api/login', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type':'application/json' },
      body:        JSON.stringify({ empid, password })
    });
    if (!res.ok) {
      const { message, error } = await res.json().catch(()=>({}));
      throw new Error(message||error||'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    navigate('/dashboard', { replace:true });
  }

  async function logout() {
    await fetch('/erp/api/logout', { method:'POST', credentials:'include' });
    setUser(null);
    navigate('/login', { replace:true });
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
