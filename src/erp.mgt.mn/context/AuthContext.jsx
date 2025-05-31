// src/erp.mgt.mn/context/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import { fetchProfile } from '../hooks/useAuth.js';

export const AuthContext = createContext({});

export default function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);

  // On mount, try to load an existing 	session:
  useEffect(() => {
    fetchProfile()
      .then(profile => {
        setUser(profile);
      })
      .catch(err => {
        // <-- currently: probably nothing here, so the 401 breaks your console
        console.error('AuthContext: fetchProfile failed', err);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
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