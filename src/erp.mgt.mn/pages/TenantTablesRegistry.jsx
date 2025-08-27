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
      const res = await fetch('/api/tenant_tables', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTables(data);
    } catch (err) {
      console.error('Failed to load tenant tables', err);
      addToast('Failed to load tenant tables', 'error');
    }
  }

  function handleChange(idx, field, value) {
    setTables((ts) => ts.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function handleSave(row) {
    if (!row.table_name) {
      addToast('Missing table name', 'error');
      return;
    }
    if (typeof row.is_shared !== 'boolean' || typeof row.seed_on_create !== 'boolean') {
      addToast('Invalid values', 'error');
      return;
    }
    setSaving((s) => ({ ...s, [row.table_name]: true }));
    try {
      const res = await fetch('/api/tenant_tables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table_name: row.table_name,
          is_shared: row.is_shared,
          seed_on_create: row.seed_on_create,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      addToast('Saved', 'success');
    } catch (err) {
      console.error('Failed to save tenant table', err);
      addToast('Failed to save tenant table', 'error');
    } finally {
      setSaving((s) => ({ ...s, [row.table_name]: false }));
    }
  }

  return (
    <div>
      <h2>Tenant Tables Registry</h2>
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
            <tr key={t.table_name}>
              <td style={styles.td}>{t.table_name}</td>
              <td style={styles.td}>
                <input
                  type="checkbox"
                  checked={!!t.is_shared}
                  onChange={(e) => handleChange(idx, 'is_shared', e.target.checked)}
                />
              </td>
              <td style={styles.td}>
                <input
                  type="checkbox"
                  checked={!!t.seed_on_create}
                  onChange={(e) => handleChange(idx, 'seed_on_create', e.target.checked)}
                />
              </td>
              <td style={styles.td}>
                <button
                  onClick={() => handleSave(t)}
                  disabled={saving[t.table_name]}
                >
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  th: { padding: '0.5rem', border: '1px solid #d1d5db' },
  td: { padding: '0.5rem', border: '1px solid #d1d5db', textAlign: 'center' },
};

