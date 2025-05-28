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

  // 1) on mount, validate cookie
  useEffect(() => {
    (async () => {
      const res = await fetch('/erp/api/auth/health', { credentials:'include' });
      if (res.ok) {
        // get full user object
        const me = await fetch('/erp/api/auth/me', { credentials:'include' }).then(r => r.json());
        setUser(me.user);
      }
    })();
  }, []);

  // 2) login fn used by Login.jsx
  async function login(identifier, password) {
    const res = await fetch('/erp/api/auth/login', {
      method: 'POST',
      credentials:'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) throw new Error((await res.json()).message);
    const { user } = await res.json();
    setUser(user);
    nav('/dashboard');
  }

   // 3) logout
  async function logout() {
    await fetch('/erp/api/auth/logout', { method:'POST', credentials:'include' });
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
