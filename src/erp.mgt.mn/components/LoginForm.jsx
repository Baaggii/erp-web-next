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
  const [error, setError] = useState(null);
  const { setUser, setCompany, setSession, setUserLevel, setPermissions } =
    useContext(AuthContext);
  const [sessionChoices, setSessionChoices] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const loggedIn = await login({ empid, password });

      // The login response returns the user profile and session information
      if (loggedIn.user) {
        setUser(loggedIn.user);
      }

      // If multiple session choices are provided, allow the user to select
      if (Array.isArray(loggedIn.sessions) && loggedIn.sessions.length > 1) {
        setSessionChoices(loggedIn.sessions);
        setCompany(null);
        setSession(null);
        return;
      }

      const session = loggedIn.session ||
        (Array.isArray(loggedIn.sessions) ? loggedIn.sessions[0] : null);

      if (session) {
        setSession(session);
        // for backward compatibility with existing hooks
        setCompany(session);
        if (loggedIn.user_level !== undefined) {
          setUserLevel(loggedIn.user_level);
        } else if (session.user_level !== undefined) {
          setUserLevel(session.user_level);
        }
        if (loggedIn.permissions) {
          setPermissions(loggedIn.permissions);
        } else if (session.permissions) {
          setPermissions(session.permissions);
        }
        if (session.company_id) {
          refreshCompanyModules(session.company_id);
        }
      }

      refreshModules();
      refreshTxnModules();
      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || 'Login error');
    }
  }

  if (sessionChoices) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const choice = sessionChoices.find(
            (c) => `${c.company_id}-${c.branch_id || ''}` === selectedSession,
          );
          if (choice) {
            setSession(choice);
            setCompany(choice);
            if (choice.user_level !== undefined) {
              setUserLevel(choice.user_level);
            }
            if (choice.permissions) {
              setPermissions(choice.permissions);
            }
            if (choice.company_id) {
              refreshCompanyModules(choice.company_id);
            }
            refreshModules();
            refreshTxnModules();
            navigate('/');
          }
        }}
        style={{ maxWidth: '320px' }}
      >
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="session" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Ажиллах салбар сонгох
          </label>
          <select
            id="session"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
          >
            <option value="" disabled>
              Сонгоно уу...
            </option>
            {sessionChoices.map((c) => (
              <option
                key={c.company_id + '-' + (c.branch_id || '')}
                value={`${c.company_id}-${c.branch_id || ''}`}
              >
                {c.branch_name ? `${c.branch_name} | ` : ''}
                {c.company_name || c.company_id}
              </option>
            ))}
          </select>
        </div>
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
          Үргэлжлүүлэх
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '320px' }}>
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
        <label
          htmlFor="password"
          style={{ display: 'block', marginBottom: '0.25rem' }}
        >
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
  );
}
