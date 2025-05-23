import { useState } from 'react'
import axios from 'axios'
import React, { useState } from 'react';
import useAuth from '../hooks/useAuth';


export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleSubmit = e => {
    e.preventDefault();
    login({ email, password });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email or ID" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">Login</button>
    </form>
  );
}