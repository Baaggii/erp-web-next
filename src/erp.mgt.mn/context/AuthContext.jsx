// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the AuthContext
export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  company: null,
  setCompany: () => {},
});

export default function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);

  // Persist selected company across reloads
  useEffect(() => {
    const stored = localStorage.getItem('erp_selected_company');
    if (stored) {
      try {
        setCompany(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    if (company) {
      localStorage.setItem('erp_selected_company', JSON.stringify(company));
    } else {
      localStorage.removeItem('erp_selected_company');
    }
  }, [company]);

  // On mount, attempt to load the current profile (if a cookie is present)
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          // Not logged in or token expired → ignore
        }
      } catch (err) {
        console.error('Unable to fetch profile:', err);
      }
    }

    loadProfile();
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, company, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
}


// Custom hook for consuming auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthContextProvider');
  }
  return context;
}
