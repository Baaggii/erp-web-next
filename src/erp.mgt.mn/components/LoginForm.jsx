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
import { collectDeviceContext } from '../utils/deviceContext.js';
import {
  getRowValueCaseInsensitive,
  resolveRelationRowsFromSource,
} from '../utils/autoRelationResolver.js';
import {
  deriveWorkplacePositionsFromAssignments,
  resolveWorkplacePositionMap,
} from '../utils/workplaceResolver.js';


function pickRelationDisplayValue(relationResult, relationRow) {
  if (!relationRow || typeof relationRow !== 'object') return null;
  const displayFields = Array.isArray(relationResult?.displayConfig?.displayFields)
    ? relationResult.displayConfig.displayFields
    : [];
  for (const field of displayFields) {
    const value = getRowValueCaseInsensitive(relationRow, field);
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  const fallbacks = ['name', 'company_name', 'branch_name', 'department_name', 'employee_name'];
  for (const field of fallbacks) {
    const value = getRowValueCaseInsensitive(relationRow, field);
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

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

  async function resolveSessionDisplayMetadata(baseSession, loggedInEmpid) {
    const session = baseSession && typeof baseSession === 'object' ? baseSession : null;
    if (!session) return baseSession;

    const sourceRow = {
      employment_company_id: session.company_id ?? session.companyId ?? null,
      employment_branch_id: session.branch_id ?? session.branchId ?? null,
      employment_department_id: session.department_id ?? session.departmentId ?? null,
      employment_emp_id:
        session.empid ??
        session.employee_id ??
        session.employeeId ??
        loggedInEmpid ??
        null,
    };

    const [companyRes, branchRes, departmentRes, employeeRes] = await Promise.all([
      resolveRelationRowsFromSource({
        sourceTable: 'tbl_employment',
        sourceRows: [sourceRow],
        sourceColumn: 'employment_company_id',
      }),
      resolveRelationRowsFromSource({
        sourceTable: 'tbl_employment',
        sourceRows: [sourceRow],
        sourceColumn: 'employment_branch_id',
        companyId: sourceRow.employment_company_id,
      }),
      resolveRelationRowsFromSource({
        sourceTable: 'tbl_employment',
        sourceRows: [sourceRow],
        sourceColumn: 'employment_department_id',
        companyId: sourceRow.employment_company_id,
      }),
      resolveRelationRowsFromSource({
        sourceTable: 'tbl_employment',
        sourceRows: [sourceRow],
        sourceColumn: 'employment_emp_id',
        companyId: sourceRow.employment_company_id,
      }),
    ]);

    const companyRow = companyRes?.rowById?.get(String(sourceRow.employment_company_id ?? '').trim()) || null;
    const branchRow = branchRes?.rowById?.get(String(sourceRow.employment_branch_id ?? '').trim()) || null;
    const departmentRow = departmentRes?.rowById?.get(String(sourceRow.employment_department_id ?? '').trim()) || null;
    const employeeRow = employeeRes?.rowById?.get(String(sourceRow.employment_emp_id ?? '').trim()) || null;

    return {
      ...session,
      company_name:
        pickRelationDisplayValue(companyRes, companyRow) ??
        (session.company_name && String(session.company_name).trim() ? String(session.company_name).trim() : session.company_name),
      branch_name:
        pickRelationDisplayValue(branchRes, branchRow) ??
        (session.branch_name && String(session.branch_name).trim() ? String(session.branch_name).trim() : session.branch_name),
      department_name:
        pickRelationDisplayValue(departmentRes, departmentRow) ??
        (session.department_name && String(session.department_name).trim() ? String(session.department_name).trim() : session.department_name),
      employee_name:
        pickRelationDisplayValue(employeeRes, employeeRow) ??
        (session.employee_name && String(session.employee_name).trim() ? String(session.employee_name).trim() : session.employee_name),
    };
  }

  async function buildCompanyOptions(sessionOptions = []) {
    const normalizedCompanies = [];
    const seen = new Set();
    const companyRows = [];

    sessionOptions.forEach((sessionOption) => {
      if (!sessionOption || typeof sessionOption !== 'object') return;
      const rawId = getRowValueCaseInsensitive(sessionOption, 'company_id');
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
      companyRows.push({ employment_company_id: normalizedId, __raw: sessionOption });
    });

    let relationResult = null;
    try {
      relationResult = await resolveRelationRowsFromSource({
        sourceTable: 'tbl_employment',
        sourceRows: companyRows,
        sourceColumn: 'employment_company_id',
      });
    } catch (err) {
      console.warn('Failed to resolve company relation for login options', err);
    }

    companyRows.forEach((companyRow) => {
      const companyIdValue = companyRow?.employment_company_id;
      const relationRow = relationResult?.rowById?.get(String(companyIdValue).trim());
      const relationName = getRowValueCaseInsensitive(relationRow, 'name');
      const rawName = getRowValueCaseInsensitive(companyRow.__raw, 'company_name');
      const fallbackName =
        relationName && String(relationName).trim().length
          ? String(relationName).trim()
          : rawName && String(rawName).trim().length
            ? String(rawName).trim()
            : `Company #${companyIdValue}`;
      normalizedCompanies.push({
        company_id: companyIdValue,
        company_name: fallbackName,
      });
    });

    normalizedCompanies.sort((a, b) => {
      const nameA = (a.company_name || '').toLowerCase();
      const nameB = (b.company_name || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });

    return normalizedCompanies;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    try {
      // Send POST /api/auth/login with credentials: 'include'
      const deviceContext = await collectDeviceContext();
      const payload = isCompanyStep
        ? { ...storedCreds, companyId: Number(companyId), ...deviceContext }
        : { empid, password, ...deviceContext };
      const loggedIn = await login(payload, t);

      if (loggedIn.needsCompany) {
        setStoredCreds({ empid, password });
        setEmpid('');
        setPassword('');
        const normalizedCompanies = await buildCompanyOptions(
          Array.isArray(loggedIn.sessions) ? loggedIn.sessions : [],
        );
        setCompanyOptions(normalizedCompanies);
        setCompanyId('');
        setIsCompanyStep(true);
        return;
      }

      // The login response already returns the user profile
      const normalizedSession = normalizeEmploymentSession(loggedIn.session);
      let enrichedSession = normalizedSession;
      if (normalizedSession) {
        try {
          enrichedSession = await resolveSessionDisplayMetadata(
            normalizedSession,
            loggedIn?.empid,
          );
        } catch (err) {
          console.warn('Failed to resolve session relation metadata after login', err);
        }
      }
      const nextUser = enrichedSession
        ? { ...loggedIn, session: enrichedSession }
        : loggedIn;

      setUser(nextUser);
      setSession(enrichedSession);
      setCompany(
        loggedIn.company ?? enrichedSession?.company_id ?? null,
      );
      setBranch(loggedIn.branch ?? enrichedSession?.branch_id ?? null);
      setDepartment(
        loggedIn.department ?? enrichedSession?.department_id ?? null,
      );
      setPosition(
        loggedIn.position ?? enrichedSession?.position_id ?? null,
      );
      setWorkplace(
        loggedIn.workplace ?? enrichedSession?.workplace_id ?? null,
      );
      setPermissions(loggedIn.permissions || null);
      const derivedWorkplaceMap =
        deriveWorkplacePositionsFromAssignments(enrichedSession);
      setWorkplacePositionMap(derivedWorkplaceMap);
      try {
        const resolvedWorkplaceMap = await resolveWorkplacePositionMap({
          session: enrichedSession,
        });
        setWorkplacePositionMap(resolvedWorkplaceMap);
      } catch (err) {
        console.warn('Failed to resolve workplace positions after login', err);
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
