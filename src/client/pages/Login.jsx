// File: src/client/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');

  // if already logged in, redirect
  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

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
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          required
        /><br/><br/>
        <label>Password</label><br/>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        /><br/><br/>
        <button type="submit">Login</button>
      </form>
    </div>
  );
}
