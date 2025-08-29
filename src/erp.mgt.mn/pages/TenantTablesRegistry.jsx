import React, { useEffect, useState } from 'react';
import Modal from '../components/Modal.jsx';
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
  const [seedingCompany, setSeedingCompany] = useState(false);
  const [seedModalOpen, setSeedModalOpen] = useState(false);
  const [selectedTables, setSelectedTables] = useState({});
  const [tableRecords, setTableRecords] = useState({});
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    loadTables();
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      const res = await fetch('/api/companies', { credentials: 'include' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || `${res.status} ${res.statusText}`);
      } else if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      setCompanies(await res.json());
    } catch (err) {
      addToast(`Failed to load companies: ${err.message}`, 'error');
    }
  }

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

  function openSeedCompanyModal() {
    setSelectedTables({});
    setTableRecords({});
    setSeedModalOpen(true);
  }

  function handleTableSelect(table, checked) {
    setSelectedTables((prev) => ({ ...prev, [table]: checked }));
    if (checked && !tableRecords[table]) {
      loadTableRecords(table);
    }
  }

  function handleRecordSelect(table, id, checked) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const selected = new Set(info.selected);
      if (checked) selected.add(id);
      else selected.delete(id);
      return { ...prev, [table]: { ...info, selected } };
    });
  }

  async function loadTableRecords(table) {
    setTableRecords((prev) => ({
      ...prev,
      [table]: { loading: true, rows: [], selected: new Set() },
    }));
    try {
      const [rowsRes, colsRes] = await Promise.all([
        fetch(`/api/tables/${encodeURIComponent(table)}?company_id=0&perPage=500`, {
          credentials: 'include',
        }),
        fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
          credentials: 'include',
        }),
      ]);
      if (!rowsRes.ok) {
        const msg = await parseErrorBody(rowsRes);
        throw new Error(msg || 'Failed to load records');
      }
      if (!colsRes.ok) {
        const msg = await parseErrorBody(colsRes);
        throw new Error(msg || 'Failed to load columns');
      }
      const rowsData = await rowsRes.json();
      const cols = await colsRes.json();
      const pk = cols.find((c) => c.key === 'PRI')?.name;
      const recs = (rowsData.rows || [])
        .filter((r) => pk && r[pk] !== undefined)
        .map((r) => ({ id: r[pk] }));
      const selected = new Set(recs.map((r) => r.id));
      setTableRecords((prev) => ({
        ...prev,
        [table]: { loading: false, rows: recs, selected },
      }));
    } catch (err) {
      setTableRecords((prev) => ({
        ...prev,
        [table]: { loading: false, rows: [], selected: new Set() },
      }));
      addToast(`Failed to load records for ${table}: ${err.message}`, 'error');
    }
  }

  async function handleSeedCompanySubmit(overwrite) {
    const tables = Object.keys(selectedTables).filter((t) => selectedTables[t]);
    if (!companyId || tables.length === 0) {
      setSeedModalOpen(false);
      return;
    }
    setSeedingCompany(true);
    try {
      const records = tables
        .map((t) => ({ table: t, ids: Array.from(tableRecords[t]?.selected || []) }))
        .filter((r) => r.ids.length > 0);
      const res = await fetch('/api/tenant_tables/seed-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          companyId,
          tables,
          records,
          overwrite,
        }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to seed company');
      }
      addToast(
        overwrite ? 'Repopulated company defaults' : 'Populated company defaults',
        'success',
      );
      setSeedModalOpen(false);
      await loadTables();
    } catch (err) {
      addToast(`Failed to seed company: ${err.message}`, 'error');
    } finally {
      setSeedingCompany(false);
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
        <button onClick={openSeedCompanyModal} disabled={seedingCompany}>
          Populate defaults for company
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
      <Modal
        visible={seedModalOpen}
        title="Populate defaults for company"
        onClose={() => setSeedModalOpen(false)}
        width="500px"
      >
        <div style={{ marginBottom: '0.5rem' }}>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">Select company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {tables && tables.filter((t) => t.seedOnCreate).length === 0 ? (
          <p>No seed_on_create tables.</p>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {tables
              ?.filter((t) => t.seedOnCreate)
              .map((t) => (
                <div key={t.tableName} style={{ marginBottom: '0.5rem' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedTables[t.tableName]}
                      onChange={(e) => handleTableSelect(t.tableName, e.target.checked)}
                    />{' '}
                    {t.tableName}
                  </label>
                  {selectedTables[t.tableName] && (
                    <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                      {tableRecords[t.tableName]?.loading ? (
                        <p>Loading...</p>
                      ) : tableRecords[t.tableName]?.rows.length ? (
                        tableRecords[t.tableName].rows.map((r) => (
                          <label key={r.id} style={{ display: 'block' }}>
                            <input
                              type="checkbox"
                              checked={tableRecords[t.tableName].selected.has(r.id)}
                              onChange={(e) =>
                                handleRecordSelect(t.tableName, r.id, e.target.checked)
                              }
                            />{' '}
                            {String(r.id)}
                          </label>
                        ))
                      ) : (
                        <p>No records</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <button
            onClick={() => handleSeedCompanySubmit(false)}
            disabled={
              seedingCompany ||
              !companyId ||
              Object.keys(selectedTables).filter((t) => selectedTables[t]).length === 0
            }
            style={{ marginRight: '0.5rem' }}
          >
            Populate
          </button>
          <button
            onClick={() => handleSeedCompanySubmit(true)}
            disabled={
              seedingCompany ||
              !companyId ||
              Object.keys(selectedTables).filter((t) => selectedTables[t]).length === 0
            }
          >
            Repopulate
          </button>
        </div>
      </Modal>
    </div>
  );
}

const styles = {
  th: { padding: '0.5rem', border: '1px solid #d1d5db' },
  td: { padding: '0.5rem', border: '1px solid #d1d5db', textAlign: 'center' },
};

