import React, { useState } from 'react';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update password');
      }
      setSuccess(true);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Нууц үг солих</h2>
      {success && <p style={{ color: 'green' }}>Нууц үг шинэчлэгдлээ</p>}
      <ErrorMessage message={error} />
      <form onSubmit={handleSubmit} style={{ maxWidth: '320px' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="newpwd" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Шинэ нууц үг
          </label>
          <input
            id="newpwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px' }}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="confirm" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Нууц үг батлах
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px' }}
          />
        </div>
        <button
          type="submit"
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
        >
          Шинэчлэх
        </button>
      </form>
    </div>
  );
}
