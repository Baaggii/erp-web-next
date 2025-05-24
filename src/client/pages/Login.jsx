import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('admin@modmarket.mn');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/erp/api/login', {
        method: 'POST',
        credentials: 'include',          // ← important
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error('Login failed');
      const { user } = await res.json();
      setUser(user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 320, margin: 'auto' }}>
      <h1>Login</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email" required
        />
        <br/>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password" required
        />
        <br/>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
