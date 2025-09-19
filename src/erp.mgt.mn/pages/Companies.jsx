import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import { useModules } from '../hooks/useModules.js';
import modulePath from '../utils/modulePath.js';

function buildBackupSuggestion(prefix) {
  const base = prefix && typeof prefix === 'string' ? prefix.trim() : 'Company backup';
  const pad = (value) => String(value).padStart(2, '0');
  const now = new Date();
  return `${base} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function getCompanyLabel(company) {
  if (!company || typeof company !== 'object') return 'Company';
  return (
    company.name ||
    company.company_name ||
    company.companyName ||
    (company.id != null ? `Company ${company.id}` : 'Company')
  );
}

function getBackupDisplayName(backup) {
  if (!backup || typeof backup !== 'object') return '';
  if (backup.originalName && typeof backup.originalName === 'string' && backup.originalName.trim()) {
    return backup.originalName.trim();
  }
  if (backup.versionName && typeof backup.versionName === 'string' && backup.versionName.trim()) {
    return backup.versionName.trim();
  }
  if (backup.fileName && typeof backup.fileName === 'string' && backup.fileName.trim()) {
    return backup.fileName.trim();
  }
  return 'Unnamed backup';
}

function formatBackupTimestamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState('');
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState('');
  const [backupTargets, setBackupTargets] = useState({});
  const navigate = useNavigate();
  const { addToast } = useToast();
  const modules = useModules();
  const moduleMap = useMemo(() => {
    const map = {};
    modules.forEach((m) => {
      map[m.module_key] = m;
    });
    return map;
  }, [modules]);

  function loadCompanies() {
    fetch('/api/companies', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch companies');
        return res.json();
      })
      .then(setCompanies)
      .catch((err) => console.error('Error fetching companies:', err));
  }

  function loadBackups() {
    setBackupsLoading(true);
    setBackupsError('');
    fetch('/api/companies/backups', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch backups');
        return res.json();
      })
      .then((data) => {
        const entries = Array.isArray(data?.backups) ? data.backups : [];
        setBackups(entries);
      })
      .catch((err) => {
        console.error('Error fetching company backups:', err);
        setBackupsError('Failed to load backups');
      })
      .finally(() => setBackupsLoading(false));
  }

  useEffect(() => {
    loadCompanies();
    loadBackups();
  }, []);

  async function handleAdd() {
    const name = prompt('Company name?');
    if (!name) return;
    const reg = prompt('Gov registration number?');
    if (reg == null) return;
    const addr = prompt('Address?');
    if (addr == null) return;
    const tel = prompt('Telephone?');
    if (tel == null) return;
    const res = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      skipErrorToast: true,
      body: JSON.stringify({
        name,
        Gov_Registration_number: reg,
        Address: addr,
        Telephone: tel
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'You need System Settings permission to add a company.',
            type: 'error'
          }
        })
      );
      return;
    }
    if (!res.ok) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Failed to add company',
            type: 'error'
          }
        })
      );
      return;
    }
    loadCompanies();
    const id = data.id;
    if (
      id != null &&
      window.confirm('Populate seed table records now?')
    ) {
      const registryModule = moduleMap.tenant_tables_registry;
      if (!registryModule) {
        addToast('Tenant Tables Registry module is unavailable.', 'error');
        return;
      }
      const basePath = modulePath(registryModule, moduleMap);
      const params = new URLSearchParams({ seed: '1', companyId: String(id) });
      navigate(`${basePath}?${params.toString()}`);
    }
  }

  async function handleEdit(c) {
    const name = prompt('Company name?', c.name);
    if (!name) return;
    const reg = prompt('Gov registration number?', c.Gov_Registration_number);
    if (reg == null) return;
    const addr = prompt('Address?', c.Address);
    if (addr == null) return;
    const tel = prompt('Telephone?', c.Telephone);
    if (tel == null) return;
    const res = await fetch('/api/companies/' + c.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      skipErrorToast: true,
      body: JSON.stringify({
        name,
        Gov_Registration_number: reg,
        Address: addr,
        Telephone: tel
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'You need System Settings permission to edit a company.',
            type: 'error'
          }
        })
      );
      return;
    }
    if (!res.ok) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Failed to update company',
            type: 'error'
          }
        })
      );
      return;
    }
    loadCompanies();
  }

  async function handleDelete(company) {
    if (!company || company.id == null) return;
    const id = company.id;
    const label = getCompanyLabel(company);
    if (
      !window.confirm(
        `Are you sure you want to delete "${label}" (ID: ${id})?\nYou will be able to create an optional backup in the next step.`,
      )
    )
      return;
    const suggestion = buildBackupSuggestion(`${label} backup`);
    const backupInput = window.prompt(
      'Enter a backup name to snapshot the tenant configuration before deleting. Leave blank to skip backup.',
      suggestion,
    );
    if (backupInput === null) return;
    const trimmedBackupName = backupInput.trim();
    const createBackup = trimmedBackupName !== '';
    const payload = createBackup
      ? { createBackup: true, backupName: trimmedBackupName }
      : { createBackup: false };
    const res = await fetch('/api/companies/' + id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      skipErrorToast: true,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      addToast('You need System Settings permission to delete a company.', 'error');
      return;
    }
    if (!res.ok) {
      addToast(data?.message || 'Failed to delete company', 'error');
      return;
    }
    loadCompanies();
    loadBackups();
    if (createBackup && !data?.backup) {
      addToast('Company deleted. No tenant-specific data required backup.', 'info');
    } else if (data?.backup) {
      const displayName = getBackupDisplayName(data.backup);
      addToast(
        displayName
          ? `Company deleted. Backup saved as ${displayName}.`
          : 'Company deleted. Backup saved.',
        'success'
      );
    } else {
      addToast('Company deleted', 'success');
    }
  }

  async function handleRestoreBackup(backup) {
    if (!backup || !backup.fileName) return;
    const selected = backupTargets[backup.fileName];
    if (!selected) {
      addToast('Select a target company to restore into.', 'warning');
      return;
    }
    const targetId = Number(selected);
    if (!Number.isFinite(targetId) || targetId <= 0) {
      addToast('Invalid target company selection.', 'error');
      return;
    }
    const res = await fetch('/api/companies/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      skipErrorToast: true,
      body: JSON.stringify({
        sourceCompanyId: backup.companyId,
        targetCompanyId: targetId,
        fileName: backup.fileName
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      addToast('You need System Settings permission to restore a backup.', 'error');
      return;
    }
    if (!res.ok) {
      addToast(data?.message || 'Failed to restore backup', 'error');
      return;
    }
    setBackupTargets((prev) => ({ ...prev, [backup.fileName]: '' }));
    loadBackups();
    const restoredTables = Array.isArray(data?.summary?.tables)
      ? data.summary.tables.length
      : data?.summary?.tableCount;
    const restoredMessage = Number.isFinite(restoredTables) && restoredTables > 0
      ? `Restored ${restoredTables} tables.`
      : 'Restore completed.';
    addToast(restoredMessage, 'success');
  }

  const visibleCompanies = companies.filter((c) =>
    (c.name || '').toLowerCase().includes(filter.toLowerCase())
  );

  const columns = useMemo(() => {
    const set = new Set(['id', 'name']);
    companies.forEach((c) => {
      Object.keys(c).forEach((k) => set.add(k));
    });
    return Array.from(set);
  }, [companies]);

  return (
    <div>
      <h2>Компаниуд</h2>
      <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
        Зөвхөн таны үүсгэсэн компаниудыг харуулна.
      </p>
      <input
        type="text"
        placeholder="Компанийн нэр шүүх"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleAdd}>Компани нэмэх</button>
      {visibleCompanies.length === 0 ? (
        <p>
          Таны үүсгэсэн компани олдсонгүй. Компани нэмэх товчийг ашиглан шинэ
          компани үүсгэнэ үү.
        </p>
      ) : (
        <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: '0.5rem'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                {columns.map((col) => (
                  <th
                    key={col}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}
                  >
                    {col}
                  </th>
                ))}
                <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map((c, i) => (
                <tr key={c.id ?? i}>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid #d1d5db'
                      }}
                    >
                      {c[col] != null ? c[col] : ''}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <button
                      onClick={() => handleEdit(c)}
                      style={{ marginRight: '0.25rem' }}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDelete(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: '1.5rem' }}>
        <h3>Company backups</h3>
        {backupsLoading ? (
          <p>Loading backups…</p>
        ) : backupsError ? (
          <p style={{ color: '#b91c1c' }}>{backupsError}</p>
        ) : backups.length === 0 ? (
          <p>No backups available. Delete a company with a backup to capture tenant data snapshots.</p>
        ) : (
          <div className="table-container overflow-x-auto" style={{ maxHeight: '50vh', marginTop: '0.5rem' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#e5e7eb' }}>
                  <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Source company</th>
                  <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Backup</th>
                  <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Generated</th>
                  <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Restore into</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => {
                  const displayName = getBackupDisplayName(backup);
                  const sourceLabel =
                    backup.companyName && typeof backup.companyName === 'string' && backup.companyName.trim()
                      ? backup.companyName.trim()
                      : backup.companyId != null
                      ? `Company ${backup.companyId}`
                      : 'Company';
                  const selectedTarget = backupTargets[backup.fileName] || '';
                  return (
                    <tr key={`${backup.companyId}-${backup.fileName}`}>
                      <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                        {sourceLabel}
                        {backup.companyId != null ? ` (ID: ${backup.companyId})` : ''}
                      </td>
                      <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                        <div>{displayName}</div>
                        {backup.fileName ? (
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{backup.fileName}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                        {formatBackupTimestamp(
                          backup.generatedAt || backup.modifiedAt || backup.createdAt,
                        )}
                      </td>
                      <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <select
                            value={selectedTarget}
                            onChange={(e) =>
                              setBackupTargets((prev) => ({
                                ...prev,
                                [backup.fileName]: e.target.value
                              }))
                            }
                          >
                            <option value="">Select target company</option>
                            {companies.map((company) => (
                              <option key={company.id ?? company.name} value={company.id}>
                                {getCompanyLabel(company)} (ID: {company.id})
                              </option>
                            ))}
                          </select>
                          <button onClick={() => handleRestoreBackup(backup)}>
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

