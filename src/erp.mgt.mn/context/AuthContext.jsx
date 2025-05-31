import { createContext, useState, useEffect, useContext } from 'react';
import { fetchProfile } from '../hooks/useAuth.js';

// 1) Create the AuthContext
export const AuthContext = createContext({
  user: null,
  setUser: () => {},
});

// 2) Export a provider component that wraps the app
export default function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // On initial load, see if the user is already logged in (cookie present).
    // NOTE: we pass credentials: 'include' so the browser sends any erp_token cookie.
    async function fetchProfile() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data);      // { id, email }
        } else {
          // 401 or 403 means “not logged in” → just leave user as null
          setUser(null);
        }
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
        setUser(null);
      }
    }

    fetchProfile();
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