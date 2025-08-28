import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function TenantTablesRegistry() {
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState({});
  const { addToast } = useToast();

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    try {
      const [optionsRes, registeredRes] = await Promise.all([
        fetch('/api/tenant_tables/options', { credentials: 'include' }),
        fetch('/api/tenant_tables', { credentials: 'include' }),
      ]);
      if (!optionsRes.ok || !registeredRes.ok)
        throw new Error('Failed to fetch');
      const [options, registered] = await Promise.all([
        optionsRes.json(),
        registeredRes.json(),
      ]);
      const regMap = new Map(registered.map((r) => [r.tableName, true]));
      const combined = options.map((t) => ({
        ...t,
        isRegistered: regMap.has(t.tableName),
      }));
      setTables(combined);
    } catch (err) {
      console.error('Failed to load tenant tables', err);
      addToast('Failed to load tenant tables', 'error');
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
      if (!res.ok) throw new Error('Failed to save');
      addToast('Saved', 'success');
      await loadTables();
    } catch (err) {
      console.error('Failed to save tenant table', err);
      addToast('Failed to save tenant table', 'error');
    } finally {
      setSaving((s) => ({ ...s, [row.tableName]: false }));
    }
  }

  return (
    <div>
      <h2>Tenant Tables Registry</h2>
      {tables.length === 0 ? (
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

