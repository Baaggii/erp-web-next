// src/erp.mgt.mn/components/LoginForm.jsx
import React, { useState, useContext } from 'react';
import { login } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshCompanyModules } from '../hooks/useCompanyModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  // login using employee ID only
  const [empid, setEmpid] = useState('');
  const [password, setPassword] = useState('');
  const [storedCreds, setStoredCreds] = useState({ empid: '', password: '' });
  const [companyOptions, setCompanyOptions] = useState([]);
  const [isCompanyStep, setIsCompanyStep] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState(null);
  const { setUser, setCompany, setPermissions } = useContext(AuthContext);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const payload = isCompanyStep
        ? { ...storedCreds, companyId: Number(companyId) }
        : { empid, password };
      const loggedIn = await login(payload);

      if (loggedIn.needsCompany) {
        setStoredCreds({ empid, password });
        setEmpid('');
        setPassword('');
        setCompanyOptions(loggedIn.sessions || []);
        setCompanyId('');
        setIsCompanyStep(true);
        return;
      }

      // The login response already returns the user profile
      setUser(loggedIn);
      setCompany(loggedIn.session || null);
      setPermissions(loggedIn.permissions || null);
      refreshCompanyModules(loggedIn.session?.company_id);
      refreshModules();
      refreshTxnModules();
      setStoredCreds({ empid: '', password: '' });
      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || 'Login error');
    }
  }

  if (isCompanyStep) {
    return (
      <div style={{ maxWidth: '320px' }}>
        <h1>Компани сонгох</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="company" style={{ display: 'block', marginBottom: '0.25rem' }}>
              Компани
            </label>
            <select
              id="company"
              value={companyId}
              onChange={(ev) => setCompanyId(ev.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
            >
              <option value="">Компани сонгох</option>
              {companyOptions.map((c) => (
                <option key={c.company_id} value={c.company_id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p style={{ color: 'red', marginBottom: '0.75rem' }}>{error}</p>
          )}

          <button
            type="submit"
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              padding: '0.5rem 1rem',
              border: '1px solid #2563eb',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            Сонгох
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '320px' }}>
      <h1>Нэвтрэх</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="empid" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Ажилтны ID
          </label>
          <input
            id="empid"
            type="text"
            value={empid}
            onChange={(ev) => setEmpid(ev.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Нууц үг
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
          />
        </div>

        {error && (
          <p style={{ color: 'red', marginBottom: '0.75rem' }}>{error}</p>
        )}

        <button
          type="submit"
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            padding: '0.5rem 1rem',
            border: '1px solid #2563eb',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
        >
          Нэвтрэх
        </button>
      </form>
    </div>
  );
}
