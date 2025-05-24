import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext({ user: null, setUser: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // On mount, you can call an endpoint to validate existing cookie
  useEffect(() => {
    fetch('/erp/api/health', {
      credentials: 'include'
    }).then(res => {
      if (res.ok) {
        // optional: fetch /erp/api/me to get full user object
        // for now, just mark logged in
        setUser({}); 
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth state
export function useAuth() {
  return useContext(AuthContext);
}
