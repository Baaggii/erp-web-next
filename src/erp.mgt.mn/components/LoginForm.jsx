// src/erp.mgt.mn/components/LoginForm.jsx
import React, { useState, useContext } from 'react';
import { login } from '../hooks/useAuth.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshCompanyModules } from '../hooks/useCompanyModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { useNavigate } from 'react-router-dom';
import I18nContext from '../context/I18nContext.jsx';
import normalizeEmploymentSession from '../utils/normalizeEmploymentSession.js';
import {
  deriveWorkplacePositionsFromAssignments,
  resolveWorkplacePositionMap,
} from '../utils/workplaceResolver.js';

export default function LoginForm() {
  // login using employee ID only
  const [empid, setEmpid] = useState('');
  const [password, setPassword] = useState('');
  const [storedCreds, setStoredCreds] = useState({ empid: '', password: '' });
  const [companyOptions, setCompanyOptions] = useState([]);
  const [isCompanyStep, setIsCompanyStep] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState(null);
  const {
    setUser,
    setSession,
    setCompany,
    setBranch,
    setDepartment,
    setPosition,
    setWorkplace,
    setWorkplacePositionMap,
    setPermissions,
  } = useContext(AuthContext);
  const { t } = useContext(I18nContext);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const payload = isCompanyStep
        ? { ...storedCreds, companyId: Number(companyId) }
        : { empid, password };
      const loggedIn = await login(payload, t);

      if (loggedIn.needsCompany) {
        setStoredCreds({ empid, password });
        setEmpid('');
        setPassword('');
        const normalizedCompanies = [];
        const seen = new Set();
        if (Array.isArray(loggedIn.sessions)) {
          loggedIn.sessions.forEach((sessionOption) => {
            if (!sessionOption || typeof sessionOption !== 'object') return;
            const rawId = sessionOption.company_id;
            const normalizedId =
              rawId === undefined || rawId === null
                ? null
                : Number.isFinite(Number(rawId))
                  ? Number(rawId)
                  : null;
            if (normalizedId === null) return;
            const key = `id:${normalizedId}`;
            if (seen.has(key)) return;
            seen.add(key);
            const fallbackName =
              sessionOption.company_name && String(sessionOption.company_name).trim().length
                ? String(sessionOption.company_name).trim()
                : `Company #${normalizedId}`;
            normalizedCompanies.push({
              company_id: normalizedId,
              company_name: fallbackName,
            });
          });
        }
        normalizedCompanies.sort((a, b) => {
          const nameA = (a.company_name || '').toLowerCase();
          const nameB = (b.company_name || '').toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
        });
        setCompanyOptions(normalizedCompanies);
        setCompanyId('');
        setIsCompanyStep(true);
        return;
      }

      // The login response already returns the user profile
      const normalizedSession = normalizeEmploymentSession(loggedIn.session);
      const nextUser = normalizedSession
        ? { ...loggedIn, session: normalizedSession }
        : loggedIn;

      setUser(nextUser);
      setSession(normalizedSession);
      setCompany(
        loggedIn.company ?? normalizedSession?.company_id ?? null,
      );
      setBranch(loggedIn.branch ?? normalizedSession?.branch_id ?? null);
      setDepartment(
        loggedIn.department ?? normalizedSession?.department_id ?? null,
      );
      setPosition(
        loggedIn.position ?? normalizedSession?.position_id ?? null,
      );
      setWorkplace(
        loggedIn.workplace ?? normalizedSession?.workplace_id ?? null,
      );
      setPermissions(loggedIn.permissions || null);
      const derivedWorkplaceMap =
        deriveWorkplacePositionsFromAssignments(normalizedSession);
      const resolvedWorkplaceMap =
        (normalizedSession?.workplace_position_map &&
          Object.keys(normalizedSession.workplace_position_map).length > 0
          ? normalizedSession.workplace_position_map
          : null) || derivedWorkplaceMap;
      setWorkplacePositionMap(resolvedWorkplaceMap);
      if (!normalizedSession?.workplace_position_map) {
        try {
          const refreshedWorkplaceMap = await resolveWorkplacePositionMap({
            session: normalizedSession,
          });
          setWorkplacePositionMap(refreshedWorkplaceMap);
        } catch (err) {
          console.warn('Failed to resolve workplace positions after login', err);
        }
      }
      refreshCompanyModules(loggedIn.company);
      refreshModules();
      refreshTxnModules();
      setStoredCreds({ empid: '', password: '' });
      navigate('/');
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message || t('loginError', 'Login error'));
    }
  }

  if (isCompanyStep) {
    return (
      <div style={{ maxWidth: '320px' }}>
        <h1>{t('selectCompany', 'Компани сонгох')}</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="company" style={{ display: 'block', marginBottom: '0.25rem' }}>
              {t('company', 'Компани')}
            </label>
            <select
              id="company"
              value={companyId}
              onChange={(ev) => setCompanyId(ev.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '3px', border: '1px solid #ccc' }}
            >
              <option value="">{t('selectCompany', 'Компани сонгох')}</option>
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
            {t('choose', 'Сонгох')}
          </button>
        </form>
      </div>
    );
  }

  return (
      <div style={{ maxWidth: '320px' }}>
        <h1>{t('login', 'Нэвтрэх')}</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="empid" style={{ display: 'block', marginBottom: '0.25rem' }}>
              {t('employeeId', 'Ажилтны ID')}
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
              {t('password', 'Нууц үг')}
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
            {t('login', 'Нэвтрэх')}
          </button>
        </form>
      </div>
  );
}
