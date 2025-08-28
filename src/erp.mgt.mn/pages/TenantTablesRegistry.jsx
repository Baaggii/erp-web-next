import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

function parseErrorBody(res) {
  return res
    .json()
    .catch(() => res.text())
    .catch(() => '')
    .then((msg) => (typeof msg === 'string' ? msg : msg?.message || ''));
}

export default function TenantTablesRegistry() {
  const [tables, setTables] = useState(null);
  const [saving, setSaving] = useState({});
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
      if (!res.ok) {
        optionsErr = await parseErrorBody(res);
      } else {
        options = await res.json();
      }
    } catch (err) {
      optionsErr = err.message;
    }
    if (optionsErr) addToast(`Failed to load table options: ${optionsErr}`, 'error');

    try {
      const res = await fetch('/api/tenant_tables', { credentials: 'include' });
      if (!res.ok) {
        registeredErr = await parseErrorBody(res);
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

