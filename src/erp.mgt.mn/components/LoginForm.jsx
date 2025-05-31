// src/erp.mgt.mn/components/LoginForm.jsx
import React, { useState, useContext } from 'react';
import { login } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      await login({ email, password });

      // Immediately fetch the profile so we know who logged in:
      const profileRes = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (!profileRes.ok) {
        throw new Error('Failed to fetch profile');
      }
      const profile = await profileRes.json();
      setUser(profile);

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
        <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Employee ID or Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
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
