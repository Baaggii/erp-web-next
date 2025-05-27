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
        // Check that our JWT cookie is valid
        const h = await fetch('/erp/api/health', { credentials:'include' });
        if (!h.ok) return;

        // Fetch full user object (id, name, empid, companies, role, …)
        const meRes = await fetch('/erp/api/users/me', { credentials:'include' });
        if (meRes.ok) {
          const me = await meRes.json();
          setUser(me);
        }
      } catch(err) {
        console.error('Auth init failed', err);
      }
    })();
  }, []);

  // identifier can be empid or email
  const login = async (identifier, password) => {
  const res = await fetch('/erp/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Auth failed');
  setUser(json.user);
  // redirect to dashboard
  navigate('/dashboard');
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
