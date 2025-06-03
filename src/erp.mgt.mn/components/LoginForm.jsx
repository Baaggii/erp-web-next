// src/erp.mgt.mn/components/LoginForm.jsx
import React, { useState, useContext } from 'react';
import { login } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  // login using a plain user ID
  const [userId, setUserId] = useState('');
  // allow login with either employee ID or email
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const loggedIn = await login({ identifier, password });

      // The login response already returns the user profile
      setUser(loggedIn);

      // Redirect to the ERP root (Dashboard)
      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || 'Login error');
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '320px' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="userid" style={{ display: 'block', marginBottom: '0.25rem' }}>
          User ID
        </label>
        <input
          id="userid"
          type="text"
          value={userId}
          onChange={(ev) => setUserId(ev.target.value)}
        <label htmlFor="identifier" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Employee ID or Email
        </label>
        <input
          id="identifier"
          type="text"
          value={identifier}
          onChange={(ev) => setIdentifier(ev.target.value)}
          required
          style={{ width: '100%', padding: '0.5rem', borderRadius: '3px' }}
        />
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="password"
          style={{ display: 'block', marginBottom: '0.25rem' }}
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          required
          style={{ width: '100%', padding: '0.5rem', borderRadius: '3px' }}
        />
      </div>

      {error && (
        <p style={{ color: 'red', marginBottom: '0.75rem' }}>{error}</p>
      )}

      <button
        type="submit"
        style={{
          backgroundColor: '#2563eb',
          color: '#fff',
          padding: '0.5rem 1rem',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
        }}
      >
        Login
      </button>
    </form>
  );
}
