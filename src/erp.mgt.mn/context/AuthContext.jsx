import { createContext, useState, useEffect, useContext } from 'react';
import { fetchProfile } from '../hooks/useAuth.js';

// Create authentication context
export const AuthContext = createContext(null);

// Provider component to wrap app
export default function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchProfile();
        setUser(profile);
      } catch (err) {
        // If we get a 401, that simply means “not logged in yet.”
        // Just swallow it; don’t spam the console on every page load.
        // console.debug('AuthContext: no active session');
      }
    })();

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