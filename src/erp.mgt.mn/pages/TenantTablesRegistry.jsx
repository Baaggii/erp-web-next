import React, { useEffect, useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import I18nContext from '../context/I18nContext.jsx';

function formatSeedSummaryId(id) {
  if (id === null || id === undefined) return '';
  if (typeof id === 'object') {
    try {
      return JSON.stringify(id);
    } catch {
      return '';
    }
  }
  return String(id);
}

function getSeedSummaryEntries(summary) {
  if (!summary || typeof summary !== 'object') return [];
  const entries = [];
  for (const [table, info] of Object.entries(summary)) {
    if (!info || typeof info !== 'object') continue;
    const count = Number(info.count);
    const safeCount = Number.isFinite(count) ? count : 0;
    const ids = Array.isArray(info.ids)
      ? info.ids
          .filter((id) => id !== null && id !== undefined)
          .map((id) => formatSeedSummaryId(id))
          .filter((val) => val !== '')
      : [];
    entries.push({ table, count: safeCount, ids });
  }
  return entries;
}

function formatSeedSummaryForToast(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries
    .map(({ table, count, ids }) => {
      const idText = ids.length > 0 ? ` (${ids.join(', ')})` : '';
      return `${table}: ${count}${idText}`;
    })
    .join('; ');
}

function getRecordKey(id) {
  if (id === null || id === undefined) return '__rec__null__';
  if (typeof id === 'object') {
    try {
      return `__rec__obj__${JSON.stringify(id)}`;
    } catch {
      return `__rec__obj__${String(id)}`;
    }
  }
  return `__rec__val__${String(id)}`;
}

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
  const [expandedTable, setExpandedTable] = useState(null);
  const [defaultRows, setDefaultRows] = useState({});
  const [columns, setColumns] = useState({});
  const [lastSeedSummary, setLastSeedSummary] = useState(null);
  const { addToast } = useToast();
  const { t } = useContext(I18nContext);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadTables();
    loadCompanies();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const seed = params.get('seed');
    const cid = params.get('companyId');
    if (seed === '1') {
      if (cid) setCompanyId(cid);
      openSeedCompanyModal();
      navigate(location.pathname, { replace: true });
    }
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

  const lastSeedEntries = lastSeedSummary?.summary
    ? getSeedSummaryEntries(lastSeedSummary.summary)
    : [];
  const lastSeedCompany = lastSeedSummary
    ? companies.find((c) => String(c.id) === String(lastSeedSummary.companyId))
    : null;

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
      addToast(t('resetSharedTenantTableKeys', 'Reset shared tenant table keys'), 'success');
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
      addToast(t('populatedDefaultsTenantKey0', 'Populated defaults (tenant key 0)'), 'success');
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
      const selected = new Set(info.selected || []);
      const key = getRecordKey(id);
      const edits = { ...(info.edits || {}) };
      if (checked) selected.add(id);
      else selected.delete(id);
      if (!checked && edits[key]) {
        delete edits[key];
      }
      const nextInfo = { ...info, selected, edits };
      const validationErrors = getValidationErrors(nextInfo);
      return {
        ...prev,
        [table]: {
          ...nextInfo,
          validationErrors,
        },
      };
    });
  }

  async function loadTableRecords(table) {
    setTableRecords((prev) => ({
      ...prev,
      [table]: {
        loading: true,
        columns: [],
        rows: [],
        selected: new Set(),
        edits: {},
        rowMap: {},
        validationErrors: [],
        primaryKey: null,
      },
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
      const colNames = cols.map((c) => c.name);
      const pk = cols.find((c) => c.key === 'PRI')?.name;
      const recs = (rowsData.rows || [])
        .map((r) => {
          const obj = {};
          colNames.forEach((name, idx) => {
            obj[name] =
              r[name] !== undefined ? r[name] : Array.isArray(r) ? r[idx] : undefined;
          });
          return { ...obj, id: pk !== undefined ? obj[pk] : undefined };
        })
        .filter((r) => r.id !== undefined);
      const selected = new Set(recs.map((r) => r.id));
      const rowMap = {};
      recs.forEach((row) => {
        rowMap[getRecordKey(row.id)] = row;
      });
      setTableRecords((prev) => ({
        ...prev,
        [table]: {
          loading: false,
          columns: colNames,
          rows: recs,
          selected,
          edits: {},
          rowMap,
          validationErrors: [],
          primaryKey: pk || null,
        },
      }));
    } catch (err) {
      setTableRecords((prev) => ({
        ...prev,
        [table]: {
          loading: false,
          columns: [],
          rows: [],
          selected: new Set(),
          edits: {},
          rowMap: {},
          validationErrors: [],
          primaryKey: null,
        },
      }));
      addToast(`Failed to load records for ${table}: ${err.message}`, 'error');
    }
  }

  function getValidationErrors(info) {
    if (!info) return [];
    const columns = info.columns || [];
    const edits = info.edits || {};
    const selectedKeys = new Set(
      Array.from(info.selected || []).map((rowId) => getRecordKey(rowId)),
    );
    const errors = [];
    for (const [key, row] of Object.entries(edits)) {
      if (!selectedKeys.has(key)) continue;
      for (const col of columns) {
        if (col === 'company_id') continue;
        const value = row[col];
        if (typeof value === 'string') {
          if (value.trim() === '') {
            errors.push(
              `Row ${formatSeedSummaryId(
                row[info.primaryKey] ?? row.id ?? key,
              )}: ${col} is required`,
            );
            break;
          }
        } else if (value === undefined) {
          errors.push(
            `Row ${formatSeedSummaryId(
              row[info.primaryKey] ?? row.id ?? key,
            )}: ${col} is required`,
          );
          break;
        }
      }
    }
    return errors;
  }

  function handleRecordInputChange(table, id, column, value) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      if (!info.selected?.has(id)) {
        return prev;
      }
      const key = getRecordKey(id);
      const edits = { ...(info.edits || {}) };
      const originalRow =
        (info.rowMap && info.rowMap[key]) ||
        info.rows.find((row) => getRecordKey(row.id) === key);
      if (!originalRow) return prev;
      const existing = edits[key];
      const currentRow = existing ? { ...existing } : { ...originalRow };
      const updatedRow = { ...currentRow, [column]: value };
      const normalize = (val) => (val === null || val === undefined ? '' : String(val));
      const differs = (info.columns || []).some((col) => {
        if (col === 'company_id') return false;
        return normalize(originalRow[col]) !== normalize(updatedRow[col]);
      });
      if (differs) {
        edits[key] = updatedRow;
      } else if (edits[key]) {
        delete edits[key];
      }
      const nextInfo = { ...info, edits };
      const validationErrors = getValidationErrors(nextInfo);
      return {
        ...prev,
        [table]: {
          ...nextInfo,
          validationErrors,
        },
      };
    });
  }

  async function handleSeedCompanySubmit(overwrite) {
    const tables = Object.keys(selectedTables).filter((t) => selectedTables[t]);
    if (!companyId || tables.length === 0) {
      setSeedModalOpen(false);
      return;
    }
    const invalidTables = tables.filter(
      (t) => (tableRecords[t]?.validationErrors || []).length > 0,
    );
    if (invalidTables.length > 0) {
      addToast(t('fixValidationErrors', 'Please resolve validation errors before seeding'), 'error');
      return;
    }
    const records = tables
      .map((t) => {
        const info = tableRecords[t];
        if (!info) return null;
        const selectedIds = Array.from(info.selected || []);
        if (selectedIds.length === 0) return null;
        const hasManualEdits = selectedIds.some((id) => {
          const key = getRecordKey(id);
          return Boolean(info.edits?.[key]);
        });
        if (hasManualEdits) {
          const rows = selectedIds
            .map((id) => {
              const key = getRecordKey(id);
              const edited = info.edits?.[key];
              const baseRow =
                edited ||
                (info.rowMap && info.rowMap[key]) ||
                info.rows.find((row) => getRecordKey(row.id) === key);
              if (!baseRow) return null;
              return { ...baseRow };
            })
            .filter((row) => row !== null);
          return rows.length > 0 ? { table: t, rows } : null;
        }
        return { table: t, ids: selectedIds };
      })
      .filter((r) => r && ((r.ids && r.ids.length > 0) || (r.rows && r.rows.length > 0)));
    setSeedingCompany(true);
    async function send(flag) {
      const res = await fetch('/api/tenant_tables/seed-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyId, tables, records, overwrite: flag }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to seed company');
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      const summary = await res.json();
      const entries = getSeedSummaryEntries(summary);
      const summaryText = formatSeedSummaryForToast(entries);
      const baseMessage = flag
        ? 'Repopulated company defaults'
        : 'Populated company defaults';
      const message = summaryText ? `${baseMessage}: ${summaryText}` : baseMessage;
      addToast(message, 'success');
      setLastSeedSummary({
        companyId: String(companyId),
        summary: summary && typeof summary === 'object' && summary !== null ? summary : {},
      });
      setSeedModalOpen(false);
      await loadTables();
      return summary;
    }
    try {
      await send(overwrite);
    } catch (err) {
      if (!overwrite && /already contains data/i.test(err.message)) {
        if (window.confirm(`${err.message}. Overwrite?`)) {
          try {
            await send(true);
          } catch (err2) {
            addToast(`Failed to seed company: ${err2.message}`, 'error');
          }
        }
      } else {
        addToast(`Failed to seed company: ${err.message}`, 'error');
      }
    } finally {
      setSeedingCompany(false);
    }
  }

  function handleToggleExpand(table) {
    if (expandedTable === table) {
      setExpandedTable(null);
    } else {
      setExpandedTable(table);
      loadDefaultRows(table);
    }
  }

  async function loadDefaultRows(table) {
    setDefaultRows((prev) => ({
      ...prev,
      [table]: { loading: true, error: '', rows: [] },
    }));
    setColumns((prev) => ({ ...prev, [table]: [] }));
    try {
      const [colsRes, rowsRes] = await Promise.all([
        fetch(`/api/tables/${encodeURIComponent(table)}/columns`, {
          credentials: 'include',
        }),
        fetch(`/api/tables/${encodeURIComponent(table)}?company_id=0&perPage=100`, {
          credentials: 'include',
        }),
      ]);
      if (!colsRes.ok) {
        const msg = await parseErrorBody(colsRes);
        throw new Error(msg || 'Failed to load columns');
      }
      if (!rowsRes.ok) {
        const msg = await parseErrorBody(rowsRes);
        throw new Error(msg || 'Failed to load rows');
      }
      const cols = await colsRes.json();
      const rowsData = await rowsRes.json();
      const colNames = cols.map((c) => c.name);
      const rows = (rowsData.rows || []).map((r) => {
        const obj = {};
        colNames.forEach((name, idx) => {
          obj[name] =
            r[name] !== undefined ? r[name] : Array.isArray(r) ? r[idx] : undefined;
        });
        return obj;
      });
      setColumns((prev) => ({ ...prev, [table]: colNames }));
      setDefaultRows((prev) => ({
        ...prev,
        [table]: { loading: false, error: '', rows },
      }));
    } catch (err) {
      addToast(`Failed to load defaults for ${table}: ${err.message}`, 'error');
      setDefaultRows((prev) => ({
        ...prev,
        [table]: { loading: false, error: err.message, rows: [] },
      }));
    }
  }

  function handleChange(idx, field, value) {
    setTables((ts) => ts.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function handleSave(row) {
    if (!row.tableName) {
      addToast(t('missingTableName', 'Missing table name'), 'error');
      return;
    }
    if (typeof row.isShared !== 'boolean' || typeof row.seedOnCreate !== 'boolean') {
      addToast(t('invalidValues', 'Invalid values'), 'error');
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
      addToast(t('saved', 'Saved'), 'success');
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
      <h2>{t('tenantTablesRegistry', 'Tenant Tables Registry')}</h2>
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
      {lastSeedSummary ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            backgroundColor: '#eef2ff',
            borderRadius: '4px',
          }}
        >
          <strong>
            {t('lastSeedSummary', 'Last seed summary')}{' '}
            {lastSeedCompany?.name || lastSeedCompany?.company_name
              ? `(${lastSeedCompany?.name || lastSeedCompany?.company_name})`
              : `(${t('companyId', 'Company ID')}: ${lastSeedSummary.companyId})`}
          </strong>
          {lastSeedEntries.length > 0 ? (
            <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
              {lastSeedEntries.map(({ table, count, ids }) => (
                <li key={table}>
                  {table}: {count}
                  {ids.length > 0 ? ` (${ids.join(', ')})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.5rem 0 0' }}>
              {t('noRecordsInserted', 'No records were inserted')}
            </p>
          )}
        </div>
      ) : null}
      {tables === null ? null : tables.length === 0 ? (
        <p>{t('noTenantTables', 'No tenant tables.')}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={styles.th}>{t('table', 'Table')}</th>
              <th style={styles.th}>{t('shared', 'Shared')}</th>
              <th style={styles.th}>{t('seedOnCreate', 'Seed on Create')}</th>
              <th style={styles.th}>{t('action', 'Action')}</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table, idx) => (
              <React.Fragment key={table.tableName}>
                <tr>
                  <td style={styles.td}>{table.tableName}</td>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={!!table.isShared}
                      onChange={(e) => handleChange(idx, 'isShared', e.target.checked)}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={!!table.seedOnCreate}
                      onChange={(e) => handleChange(idx, 'seedOnCreate', e.target.checked)}
                    />
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleSave(table)}
                      disabled={saving[table.tableName]}
                    >
                      Save
                    </button>{' '}
                    <button onClick={() => handleToggleExpand(table.tableName)}>
                      {expandedTable === table.tableName ? 'Collapse' : 'Expand'}
                    </button>
                  </td>
                </tr>
                {expandedTable === table.tableName && (
                  <tr>
                    <td colSpan={4} style={{ padding: '0.5rem' }}>
                      {defaultRows[table.tableName]?.loading ? (
                        <p>{t('loading', 'Loading...')}</p>
                      ) : defaultRows[table.tableName]?.error ? (
                        <p>Error: {defaultRows[table.tableName].error}</p>
                      ) : defaultRows[table.tableName]?.rows.length ? (
                        <div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f3f4f6' }}>
                                {columns[table.tableName]?.map((c) => (
                                  <th key={c} style={styles.th}>
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {defaultRows[table.tableName].rows.map((r, i) => (
                                <tr key={i}>
                                  {columns[table.tableName]?.map((c) => (
                                    <td key={c} style={styles.td}>
                                      {String(r[c])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                            <button onClick={() => setExpandedTable(null)}>{t('collapse', 'Collapse')}</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p>{t('noRecords', 'No records')}</p>
                          <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                            <button onClick={() => setExpandedTable(null)}>{t('collapse', 'Collapse')}</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
            <option value="">{t('selectCompany', 'Select company')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {tables === null ? (
          <p>{t('loading', 'Loading...')}</p>
        ) : (tables ?? []).filter((t) => t.seedOnCreate).length === 0 ? (
          <p>{t('noSeedOnCreateTables', 'No seed_on_create tables.')}</p>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {(tables ?? [])
              .filter((t) => t.seedOnCreate)
              .map((table) => (
                <div key={table.tableName} style={{ marginBottom: '0.5rem' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!selectedTables[table.tableName]}
                      onChange={(e) => handleTableSelect(table.tableName, e.target.checked)}
                    />{' '}
                    {table.tableName}
                  </label>
                  {selectedTables[table.tableName] && (
                    <div style={{ marginLeft: '1rem', marginTop: '0.25rem' }}>
                      {tableRecords[table.tableName]?.loading ? (
                        <p>{t('loading', 'Loading...')}</p>
                      ) : tableRecords[table.tableName]?.columns &&
                        tableRecords[table.tableName]?.rows ? (
                        tableRecords[table.tableName].rows.length ? (
                          <table style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={styles.th}></th>
                                {(tableRecords[table.tableName]?.columns ?? []).map((c) => (
                                  <th key={c} style={styles.th}>
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(tableRecords[table.tableName]?.rows ?? []).map((r) => {
                                const info = tableRecords[table.tableName];
                                const selectedSet = info?.selected || new Set();
                                const isSelected = selectedSet.has(r.id);
                                const key = getRecordKey(r.id);
                                const currentRow = info?.edits?.[key] || r;
                                const columns = info?.columns ?? [];
                                return (
                                  <tr key={r.id}>
                                    <td style={styles.td}>
                                      <input
                                        type="checkbox"
                                        checked={!!selectedSet.has(r.id)}
                                        onChange={(e) =>
                                          handleRecordSelect(
                                            table.tableName,
                                            r.id,
                                            e.target.checked,
                                          )
                                        }
                                      />
                                    </td>
                                    {columns.map((c) => {
                                      const value = currentRow?.[c];
                                      const displayValue =
                                        value === null || value === undefined
                                          ? ''
                                          : String(value);
                                      const isEditable =
                                        isSelected &&
                                        c !== info?.primaryKey &&
                                        c !== 'company_id';
                                      return (
                                        <td key={c} style={styles.td}>
                                          {isEditable ? (
                                            <input
                                              type="text"
                                              value={displayValue}
                                              onChange={(e) =>
                                                handleRecordInputChange(
                                                  table.tableName,
                                                  r.id,
                                                  c,
                                                  e.target.value,
                                                )
                                              }
                                              style={{ width: '100%' }}
                                            />
                                          ) : (
                                            displayValue
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {(tableRecords[table.tableName]?.validationErrors || []).length >
                          0 ? (
                            <div style={{ marginTop: '0.5rem', color: '#b91c1c' }}>
                              <ul style={{ margin: '0.25rem 0 0 1.25rem' }}>
                                {(
                                  tableRecords[table.tableName]?.validationErrors || []
                                ).map((msg, idx) => (
                                  <li key={`${msg}-${idx}`}>{msg}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        ) : (
                          <p>{t('noRecords', 'No records')}</p>
                        )
                      ) : (
                        <p>
                          {t(
                            'loadFailed',
                            `Failed to load records for ${table.tableName}`
                          )}
                        </p>
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
              Object.keys(selectedTables).filter((t) => selectedTables[t]).length === 0 ||
              Object.entries(tableRecords).some(
                ([tableName, info]) =>
                  selectedTables[tableName] && (info?.validationErrors || []).length > 0,
              )
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
              Object.keys(selectedTables).filter((t) => selectedTables[t]).length === 0 ||
              Object.entries(tableRecords).some(
                ([tableName, info]) =>
                  selectedTables[tableName] && (info?.validationErrors || []).length > 0,
              )
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

