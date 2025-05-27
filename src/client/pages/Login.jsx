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

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <div><input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" /></div>
      <div><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" /></div>
      <button type="submit">Login</button>
    </form>
  );
}
