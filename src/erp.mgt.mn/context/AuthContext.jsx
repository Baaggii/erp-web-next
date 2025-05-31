// src/erp.mgt.mn/context/AuthContext.jsx
import { createContext, useState, useEffect } from 'react';
import { fetchProfile } from '../hooks/useAuth.jsx';

export const AuthContext = createContext({ user: null, setUser: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // On mount, attempt to fetch the current user
  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchProfile();
        setUser(profile);
      } catch {
        setUser(null);
      }
    })();
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