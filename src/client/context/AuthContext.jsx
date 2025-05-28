import React, { createContext, useContext, useEffect, useState } from 'react';
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // on mount: ping /erp/api/auth/health → if 200 then fetch /erp/api/auth/me
  useEffect(() => {
    (async () => {
      const r = await fetch('/erp/api/auth/health', { credentials:'include' });
      if (!r.ok) return;
      const me = await fetch('/erp/api/auth/me', { credentials:'include' });
      if (me.ok) {
        const { id } = await me.json();
        setUser({ id });
      }
    })();
  }, []);

  // wrapper around POST /erp/api/auth/login
  const login = async (identifier, password) => {
    const res = await fetch('/erp/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ identifier, password }),
      credentials:'include'
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.message||'Login failed');
    }
    const { user } = await res.json();
    setUser(user);
  };

  const logout = async () => {
    await fetch('/erp/api/auth/logout', { method:'POST', credentials:'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
