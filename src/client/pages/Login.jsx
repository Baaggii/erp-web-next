// File: src/client/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [idOrEmail, setIdOrEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (user) nav('/dashboard');
  }, [user, nav]);

  const submit = async e => {
    e.preventDefault();
    setErr('');
    try {
      await login(idOrEmail, pw);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth:400, margin:'auto', padding:20 }}>
      <h1>Login</h1>
      {err && <p style={{ color:'red' }}>{err}</p>}
      <label>Employee ID or Email<br/>
        <input
          value={idOrEmail}
          onChange={e => setIdOrEmail(e.target.value)}
          required />
      </label>
      <br/><br/>
      <label>Password<br/>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          required />
      </label>
      <br/><br/>
      <button type="submit">Login</button>
    </form>
  );
}
