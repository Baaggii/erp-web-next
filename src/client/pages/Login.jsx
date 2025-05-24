import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      navigate('/');
    } else {
      alert('Login failed');
    }
  };

fetch('/erp/api/login', {
  method: 'POST',
  credentials: 'include',           // ← important
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
.then(res => {
  if (!res.ok) throw new Error('Login failed');
  return res.json();
})
.then(({ user }) => {
  // Save user in context / state, then redirect:
  navigate('/erp/dashboard');
})
.catch(err => setError(err.message));


  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <div><input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" /></div>
      <div><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" /></div>
      <button type="submit">Login</button>
    </form>
  );
}
