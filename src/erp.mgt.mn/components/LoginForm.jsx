// src/erp.mgt.mn/components/LoginForm.jsx
import React, { useState, useContext } from 'react';
import { login } from '../hooks/useAuth.jsx';
import { refreshRolePermissions } from '../hooks/useRolePermissions.js';
import { refreshModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function LoginForm() {
  // login using employee ID only
  const [empid, setEmpid] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const { setUser, setCompany } = useContext(AuthContext);
  const [companyChoices, setCompanyChoices] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const loggedIn = await login({ empid, password });

      // The login response already returns the user profile
      setUser(loggedIn);

      // Fetch company assignments
      const res = await fetch(
        `/api/user_companies?empid=${encodeURIComponent(loggedIn.empid)}`,
        { credentials: 'include' },
      );
      const assignments = res.ok ? await res.json() : [];

      if (assignments.length === 1) {
        setCompany(assignments[0]);
        refreshModules();
        refreshRolePermissions(
          assignments[0].role_id || loggedIn.role_id,
          assignments[0].company_id,
        );
        navigate('/');
      } else if (assignments.length > 1) {
        setCompany(null);
        setCompanyChoices(assignments);
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || 'Login error');
    }
  }

  if (companyChoices) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const choice = companyChoices.find(
            (c) => `${c.company_id}-${c.branch_id || ''}` === selectedCompany,
          );
          if (choice) {
            setCompany(choice);
            refreshModules();
            refreshRolePermissions(
              choice.role_id || choice.roleId || loggedIn.role_id,
              choice.company_id,
            );
            navigate('/');
          }
        }}
        style={{ maxWidth: '320px' }}
      >
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="company" style={{ display: 'block', marginBottom: '0.25rem' }}>
            Компани сонгох
          </label>
          <select
            id="company"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
          >
            <option value="" disabled>
              Сонгоно уу...
            </option>
            {companyChoices.map((c) => (
              <option
                key={c.company_id + '-' + (c.branch_id || '')}
                value={`${c.company_id}-${c.branch_id || ''}`}
              >
                {c.branch_name ? `${c.branch_name} | ` : ''}{c.company_name}
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
