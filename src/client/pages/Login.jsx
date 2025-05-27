import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const [error, setError] = useState('');

  // if already logged in
  useEffect(() => {
    if (user) nav('/dashboard');
  }, [user]);

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
        <label>Employee ID or Email<br/>
        <input
          value={identifier}
          onChange={e => setId(e.target.value)}
          required
        /></label>
        <br/><br/>
        <label>Password<br/>
        <input
          type="password"
          value={password}
          onChange={e => setPw(e.target.value)}
          required
        /></label>
        <br/><br/>
        <button>Login</button>
      </form>
    </div>
  );
}
