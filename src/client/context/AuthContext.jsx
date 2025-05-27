// in src/client/context/AuthContext.jsx
export function AuthProvider({ children }) {
  // …
  const login = async (identifier, password) => {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // still send as "email", so your SQL can match either email or id
      body: JSON.stringify({ email: identifier, password })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }
    const { user: u } = await res.json();
    setUser(u);
    navigate('/dashboard', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
