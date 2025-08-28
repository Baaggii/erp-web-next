import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

async function parseErrorBody(res) {
  const ct = res.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const data = await res.json();
      return typeof data === 'string' ? data : data.message || '';
    }
    const text = await res.text();
    return text.startsWith('<') ? '' : text;
  } catch {
    return '';
  }
}

export default function TenantTablesRegistry() {
  const [tables, setTables] = useState(null);
  const [saving, setSaving] = useState({});
  const [resetting, setResetting] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [seedingCompanies, setSeedingCompanies] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    let options = [];
    let registered = [];
    let optionsErr = '';
    let registeredErr = '';

    try {
      const res = await fetch('/api/tenant_tables/options', {
        credentials: 'include',
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        optionsErr = await parseErrorBody(res) || `${res.status} ${res.statusText}`;
      } else if (!ct.includes('application/json')) {
        optionsErr = `Unexpected response: ${ct || 'unknown content-type'}`;
      } else {
        options = await res.json();
      }
    } catch (err) {
      optionsErr = err.message;
    }
    if (optionsErr) addToast(`Failed to load table options: ${optionsErr}`, 'error');

    try {
      const res = await fetch('/api/tenant_tables', { credentials: 'include' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        registeredErr = await parseErrorBody(res) || `${res.status} ${res.statusText}`;
      } else if (!ct.includes('application/json')) {
        registeredErr = `Unexpected response: ${ct || 'unknown content-type'}`;
      } else {
        registered = await res.json();
      }
    } catch (err) {
      registeredErr = err.message;
    }
    if (registeredErr)
      addToast(`Failed to load registered tables: ${registeredErr}`, 'error');

    if (options.length) {
      const regMap = new Map(registered.map((r) => [r.tableName, true]));
      setTables(
        options.map((t) => ({
          ...t,
          isRegistered: regMap.has(t.tableName),
        })),
      );
    } else {
      setTables([]);
    }
  }

  async function handleResetTenantKeys() {
    setResetting(true);
    try {
      const res = await fetch('/api/tenant_tables/zero-keys', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to reset');
      }
      addToast('Reset shared tenant table keys', 'success');
      await loadTables();
    } catch (err) {
      addToast(`Failed to reset tenant keys: ${err.message}`, 'error');
    } finally {
      setResetting(false);
    }
  }

  async function handleSeedDefaults() {
    setSeedingDefaults(true);
    try {
      const res = await fetch('/api/tenant_tables/seed-defaults', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to seed defaults');
      }
      addToast('Populated defaults (tenant key 0)', 'success');
      await loadTables();
    } catch (err) {
      addToast(`Failed to seed defaults: ${err.message}`, 'error');
    } finally {
      setSeedingDefaults(false);
    }
  }

  async function handleSeedCompanies() {
    setSeedingCompanies(true);
    try {
      const res = await fetch('/api/tenant_tables/seed-companies', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to seed companies');
      }
      addToast('Populated defaults for existing companies', 'success');
      await loadTables();
    } catch (err) {
      addToast(`Failed to seed companies: ${err.message}`, 'error');
    } finally {
      setSeedingCompanies(false);
    }
  }

  function handleChange(idx, field, value) {
    setTables((ts) => ts.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function handleSave(row) {
    if (!row.tableName) {
      addToast('Missing table name', 'error');
      return;
    }
    if (typeof row.isShared !== 'boolean' || typeof row.seedOnCreate !== 'boolean') {
      addToast('Invalid values', 'error');
      return;
    }
    setSaving((s) => ({ ...s, [row.tableName]: true }));
    try {
      const isUpdate = row.isRegistered;
      const url = isUpdate
        ? `/api/tenant_tables/${row.tableName}`
        : '/api/tenant_tables';
      const method = isUpdate ? 'PUT' : 'POST';
      const body = isUpdate
        ? { isShared: row.isShared, seedOnCreate: row.seedOnCreate }
        : {
            tableName: row.tableName,
            isShared: row.isShared,
            seedOnCreate: row.seedOnCreate,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to save');
      }
      addToast('Saved', 'success');
      await loadTables();
    } catch (err) {
      console.error('Failed to save tenant table', err);
      addToast(`Failed to save tenant table: ${err.message}`, 'error');
    } finally {
      setSaving((s) => ({ ...s, [row.tableName]: false }));
    }
  }

  return (
    <div>
      <h2>Tenant Tables Registry</h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button onClick={handleSeedDefaults} disabled={seedingDefaults}>
          Populate defaults (tenant key 0)
        </button>
        <button onClick={handleSeedCompanies} disabled={seedingCompanies}>
          Populate defaults for existing companies
        </button>
        <button onClick={handleResetTenantKeys} disabled={resetting}>
          Reset Shared Table Tenant Keys
        </button>
      </div>
      {tables === null ? null : tables.length === 0 ? (
        <p>No tenant tables.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={styles.th}>Table</th>
              <th style={styles.th}>Shared</th>
              <th style={styles.th}>Seed on Create</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t, idx) => (
              <tr key={t.tableName}>
                <td style={styles.td}>{t.tableName}</td>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={!!t.isShared}
                    onChange={(e) => handleChange(idx, 'isShared', e.target.checked)}
                  />
                </td>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={!!t.seedOnCreate}
                    onChange={(e) => handleChange(idx, 'seedOnCreate', e.target.checked)}
                  />
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleSave(t)}
                    disabled={saving[t.tableName]}
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  th: { padding: '0.5rem', border: '1px solid #d1d5db' },
  td: { padding: '0.5rem', border: '1px solid #d1d5db', textAlign: 'center' },
};

