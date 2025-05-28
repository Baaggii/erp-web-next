import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [idOrEmail, setIdOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (user) nav('/dashboard');
  }, [user]);

  const onSubmit = async e => {
    e.preventDefault();
    try {
      await login(idOrEmail, password);
      nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <h1>Login</h1>
      {err && <p style={{color:'red'}}>{err}</p>}
      <label>Employee ID or Email</label>
      <input value={idOrEmail} onChange={e=>setIdOrEmail(e.target.value)} required />
      <label>Password</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
      <button>Login</button>
    </form>
  );
}
