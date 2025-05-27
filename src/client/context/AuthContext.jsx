import React, { createContext, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext({ user: null, login: async()=>{}, logout: ()=>{} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // on mount, validate cookie & fetch /users/me
  useEffect(() => {
    fetch('/api/health', { credentials: 'include' })
      .then(res => {
        if (res.ok) {
          return fetch('/api/users/me', { credentials: 'include' });
        }
        throw new Error('No session');
      })
      .then(r => r.json())
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  // identifier = empid OR email
  async function login(identifier, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({ message: res.statusText }));
      throw new Error(err.message || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    navigate('/dashboard');
  }

  async function logout() {
    await fetch('/api/logout', { method:'POST', credentials:'include' });
    setUser(null);
    navigate('/login');
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
