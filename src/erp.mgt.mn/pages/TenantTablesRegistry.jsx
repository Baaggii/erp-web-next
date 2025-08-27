import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import Spinner from '../components/Spinner.jsx';

export default function TenantTablesRegistry() {
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    setLoading(true);
    try {
      const [tablesRes, registryRes] = await Promise.all([
        fetch('/api/tables', { credentials: 'include' }),
        fetch('/api/tenant_tables', { credentials: 'include' }),
      ]);
      if (!tablesRes.ok || !registryRes.ok) throw new Error('Failed to fetch');
      const allTables = await tablesRes.json();
      const registry = await registryRes.json();
      const map = new Map(
        Array.isArray(registry)
          ? registry.map((r) => [r.tableName, r])
          : [],
      );
      const merged = Array.isArray(allTables)
        ? allTables.map((name) =>
            map.get(name) || {
              tableName: name,
              isShared: false,
              seedOnCreate: false,
            },
          )
        : [];
      setTables(merged);
    } catch (err) {
      console.error('Failed to load tenant tables', err);
      addToast('Failed to load tenant tables', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(idx, field, value) {
    setTables((ts) => ts.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  function handleAdd() {
    setTables((ts) => [
      ...ts,
      { table_name: '', is_shared: false, seed_on_create: false, isNew: true },
    ]);
  }

  async function handleSave(row) {
    setSaving((s) => ({ ...s, [row.tableName]: true }));
    try {
      const res = await fetch(
        `/api/tenant_tables/${encodeURIComponent(row.tableName)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            isShared: row.isShared,
            seedOnCreate: row.seedOnCreate,
          }),
        },
      );
      if (!res.ok) throw new Error('Failed to save');
      addToast('Saved', 'success');
      loadTables();
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
      {loading ? (
        <Spinner />
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={styles.th}>Table</th>
              <th style={styles.th}>Shared</th>
              <th style={styles.th}>Seed on Create</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tables.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan="4">
                  No tables found.
                </td>
              </tr>
            ) : (
              tables.map((t, idx) => (
                <tr key={t.tableName || idx}>
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
                      onChange={(e) =>
                        handleChange(idx, 'seedOnCreate', e.target.checked)
                      }
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
              ))
            )}
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

