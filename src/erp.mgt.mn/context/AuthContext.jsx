import { createContext, useState, useEffect } from 'react';
import { fetchProfile } from '../hooks/useAuth.js';

export const AuthContext = createContext();
export default function AuthContextProvider({ children }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetchProfile().then(setUser).catch(() => setUser(null));
  }, []);
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}