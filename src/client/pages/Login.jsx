// File: src/client/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useAuth }                    from '../context/AuthContext.jsx';
import { useNavigate }                from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const nav             = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (user) nav('/dashboard');
  }, [user, nav]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding:20, maxWidth:400, margin:'auto' }}>
      <h1>Login</h1>
      {error && <p style={{ color:'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>Employee ID or Email</label><br/>
        <input
          type="text"
          value={identifier}
          onChange={e=>setIdentifier(e.target.value)}
          required
          autoComplete="username"
        /><br/><br/>
        <label>Password</label><br/>
        <input
          type="password"
          value={password}
          onChange={e=>setPassword(e.target.value)}
          required
          autoComplete="current-password"
        /><br/><br/>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
