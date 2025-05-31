// src/erp.mgt.mn/components/LoginForm.jsx
import { useState, useContext } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setUser } = useContext(AuthContext);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage(null);

    try {
      // 1) Call login(), which does POST /api/auth/login with credentials: 'include'
      const data = await login({ email, password });
      // data === { id, email }

      // 2) Immediately fetch /api/auth/me to confirm the cookie is accepted
      // If 200, profile is the same { id, email } and it updates context again
      const resMe = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (resMe.ok) {
        const profile = await resMe.json();
        setUser(profile);
        navigate('/'); // success → go to home or dashboard
      } else {
        // If 401 or anything else, something is wrong – 
        // but we already got data from login(), so this should not happen.
        setErrorMessage('Login succeeded but could not fetch profile.');
      }
    } catch (err) {
      setErrorMessage(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {errorMessage && (
        <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>
          {errorMessage}
        </div>
      )}
      <div>
        <label htmlFor="email">Employee ID or Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit">Login</button>
    </form>
  );
}
