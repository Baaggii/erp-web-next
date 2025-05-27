// File: src/client/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useAuth }     from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [empid, setEmpid]   = useState('');
  const [password, setPwd]   = useState('');
  const [error, setError]    = useState('');

  // if already logged in, redirect
  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await login(empid.trim(), password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth:400, margin:'auto', padding:20 }}>
      <h1>Login</h1>
      {error && <p style={{ color:'red' }}>{error}</p>}

      <label>Employee ID</label><br/>
      <input
        value={empid}
        onChange={e => setEmpid(e.target.value)}
        required
      /><br/><br/>

      <label>Password</label><br/>
      <input
        type="password"
        value={password}
        onChange={e => setPwd(e.target.value)}
        required
      /><br/><br/>

      <button type="submit">Login</button>
    </form>
  );
}
