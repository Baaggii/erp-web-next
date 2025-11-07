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

const containerStyle = {
  width: '100%',
  maxWidth: '360px',
  background: '#ffffff',
  borderRadius: '18px',
  boxShadow: '0 45px 80px rgba(15, 23, 42, 0.18)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  padding: '2.5rem 2rem',
  backdropFilter: 'blur(4px)',
};

const headerStyle = {
  marginBottom: '1.25rem',
  color: '#0f172a',
  textAlign: 'center',
  fontSize: '1.65rem',
  fontWeight: 700,
  letterSpacing: '-0.025em',
};

const subtitleStyle = {
  marginBottom: '1.75rem',
  color: '#475569',
  textAlign: 'center',
  fontSize: '0.95rem',
  lineHeight: 1.5,
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#1e293b',
};

const inputStyle = {
  width: '100%',
  padding: '0.75rem 0.9rem',
  borderRadius: '12px',
  border: '1px solid rgba(148, 163, 184, 0.45)',
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  boxShadow: '0 1px 1px rgba(15, 23, 42, 0.04)',
};

const buttonStyle = {
  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
  color: '#fff',
  padding: '0.85rem 1rem',
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '1rem',
  letterSpacing: '0.01em',
  boxShadow: '0 18px 35px rgba(37, 99, 235, 0.35)',
};

const errorStyle = {
  color: '#dc2626',
  fontSize: '0.9rem',
  textAlign: 'center',
};

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
      <section style={containerStyle}>
        <h1 style={headerStyle}>{t('selectCompany', 'Компани сонгох')}</h1>
        <p style={subtitleStyle}>
          {t('selectCompanySubtitle', 'Ажиллах компанийг сонгоно уу')}
        </p>
        <form onSubmit={handleSubmit} style={formStyle}>
          <div>
            <label htmlFor="company" style={labelStyle}>
              {t('company', 'Компани')}
            </label>
            <select
              id="company"
              value={companyId}
              onChange={(ev) => setCompanyId(ev.target.value)}
              required
              style={{
                ...inputStyle,
                appearance: 'none',
                cursor: 'pointer',
                backgroundImage: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBvbHlnb24gcG9pbnRzPSIxIDEgNiA3IDExIDEiIHN0eWxlPSJmaWxsOiM2N2E4YmQiIC8+PC9zdmc+)',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'calc(100% - 12px) center',
              }}
            >
              <option value="">{t('selectCompany', 'Компани сонгох')}</option>
              {companyOptions.map((c) => (
                <option key={c.company_id} value={c.company_id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" style={buttonStyle}>
            {t('choose', 'Сонгох')}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section style={containerStyle}>
      <h1 style={headerStyle}>{t('login', 'Нэвтрэх')}</h1>
      <p style={subtitleStyle}>
        {t('loginSubtitle', 'Нэвтрэхдээ ажилтны ID болон нууц үгээ ашиглана уу')}
      </p>
      <form onSubmit={handleSubmit} style={formStyle}>
        <div>
          <label htmlFor="empid" style={labelStyle}>
            {t('employeeId', 'Ажилтны ID')}
          </label>
          <input
            id="empid"
            type="text"
            value={empid}
            onChange={(ev) => setEmpid(ev.target.value)}
            required
            autoComplete="username"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="password" style={labelStyle}>
            {t('password', 'Нууц үг')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
          />
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <button type="submit" style={buttonStyle}>
          {t('login', 'Нэвтрэх')}
        </button>
      </form>
    </section>
  );
}
