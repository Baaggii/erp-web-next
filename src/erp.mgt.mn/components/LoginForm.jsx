// src/erp.mgt.mn/components/LoginForm.jsx
import { useState, useContext } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';   // <-- import the hook, not `login` directly
import { AuthContext } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  // Destructure `login` from the hook:
  const { login } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      // call login(...) → sets cookie + returns user payload
      const userData = await login({ email, password });
      setUser(userData);

      // Fetch full profile (optional) or redirect:
      const profile = await fetch('/api/auth/me', { credentials: 'include' }).then((res) => {
        if (!res.ok) throw new Error('Failed to fetch profile');
        return res.json();
      });
      setUser(profile);

      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
      alert(err.message || 'Login error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div>
        <label htmlFor="email">Employee ID or Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit">Login</button>
    </form>
  );
}
