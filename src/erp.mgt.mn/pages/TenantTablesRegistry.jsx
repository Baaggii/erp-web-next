import React, { useEffect, useState, useContext, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import I18nContext from '../context/I18nContext.jsx';
import { updateTablesWithChange, buildRowIdentifier } from './TenantTablesRegistry.helpers.js';

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

function formatRowIdKey(id) {
  if (id === null || id === undefined) return 'null';
  if (typeof id === 'object') {
    try {
      return JSON.stringify(id);
    } catch {
      return String(id);
    }
  }
  return String(id);
}

function convertRowValueToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isAuditColumn(name) {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return lower.startsWith('created_') || lower.startsWith('updated_');
}

function formatAuditDateParts(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

function formatAuditTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatAuditDateParts(value);
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return formatAuditDateParts(date);
  }
  const str = typeof value === 'string' ? value.trim() : String(value);
  if (!str) return null;
  if (str.toLowerCase() === 'null') return null;
  const isoLike = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]} ${isoLike[4]}:${isoLike[5]}:${isoLike[6]}`;
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatAuditDateParts(parsed);
}

function formatSnapshotTimestamp(value) {
  if (!value || (typeof value === 'string' && value.trim() === '')) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function createEditableCopy(row, columns) {
  const editable = {};
  for (const column of columns || []) {
    if (column === 'company_id' || isAuditColumn(column)) continue;
    editable[column] = convertRowValueToString(row?.[column]);
  }
  return editable;
}

function hasRowChanges(originalRow, draft, columns) {
  if (!originalRow) return false;
  for (const column of columns || []) {
    if (column === 'company_id') continue;
    if (isAuditColumn(column)) {
      const originalValue = formatAuditTimestamp(originalRow?.[column]) ?? '';
      const draftHasValue =
        draft && Object.prototype.hasOwnProperty.call(draft, column);
      const draftValue = draftHasValue
        ? formatAuditTimestamp(draft[column]) ?? ''
        : originalValue;
      if (draftValue !== originalValue) {
        return true;
      }
      continue;
    }
    const originalValue = convertRowValueToString(originalRow[column]);
    const draftValue =
      draft && Object.prototype.hasOwnProperty.call(draft, column)
        ? String(draft[column] ?? '')
        : originalValue;
    if (draftValue !== originalValue) {
      return true;
    }
  }
  return false;
}

function coerceManualRowValue(value, originalValue) {
  if (value === null || value === undefined) return value;
  if (value === '') {
    if (originalValue === null || originalValue === undefined) {
      return null;
    }
    return '';
  }
  if (typeof originalValue === 'number') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof originalValue === 'boolean') {
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
  }
  if (String(value).toLowerCase() === 'null') return null;
  return value;
}

function buildManualRowFromDraft(originalRow, draft, columns) {
  const manual = {};
  for (const column of columns || []) {
    if (column === 'company_id') continue;
    if (isAuditColumn(column)) continue;
    if (draft && Object.prototype.hasOwnProperty.call(draft, column)) {
      const raw = draft[column];
      const value = coerceManualRowValue(raw, originalRow?.[column]);
      if (value !== undefined) {
        manual[column] = value;
      }
    } else if (originalRow && originalRow[column] !== undefined) {
      manual[column] = originalRow[column];
    }
  }
  return manual;
}

function buildManualRowForNew(values, columns) {
  const manual = {};
  for (const column of columns || []) {
    if (column === 'company_id') continue;
    if (!values || !Object.prototype.hasOwnProperty.call(values, column)) continue;
    const raw = values[column];
    if (raw === '' || raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    if (isAuditColumn(column)) continue;
    manual[column] = raw;
  }
  return manual;
}

function rowHasValues(values) {
  if (!values || typeof values !== 'object') return false;
  return Object.values(values).some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  });
}

function normalizeSeedDefaultsConflict(data) {
  if (!data || typeof data !== 'object') return null;
  const message =
    typeof data.message === 'string' ? data.message.trim() : '';
  const conflicts = Array.isArray(data.conflicts)
    ? data.conflicts
        .map((entry) => {
          const tableRaw =
            typeof entry?.table === 'string'
              ? entry.table
              : typeof entry?.tableName === 'string'
              ? entry.tableName
              : '';
          const table = tableRaw.trim();
          if (!table) return null;
          let companies = Array.isArray(entry?.companies)
            ? entry.companies
                .map((company) => {
                  const rawId =
                    company?.companyId ??
                    company?.company_id ??
                    company?.id ??
                    company?.company ??
                    null;
                  if (rawId === null || rawId === undefined || rawId === '') {
                    return null;
                  }
                  const id = String(rawId);
                  const rowsVal = Number(company?.rows ?? company?.count ?? 0);
                  if (!Number.isFinite(rowsVal) || rowsVal <= 0) return null;
                  return { companyId: id, rows: rowsVal };
                })
                .filter(Boolean)
            : [];
          if (companies.length === 0 && Array.isArray(entry?.companyIds)) {
            companies = entry.companyIds
              .filter((id) => id !== null && id !== undefined && id !== '')
              .map((id) => ({ companyId: String(id), rows: 0 }));
          }
          const totalRowsVal = Number(entry?.rows);
          const totalRows = Number.isFinite(totalRowsVal) && totalRowsVal > 0
            ? totalRowsVal
            : companies.reduce(
                (sum, comp) => sum + (Number.isFinite(comp.rows) ? comp.rows : 0),
                0,
              );
          return {
            table,
            rows: totalRows > 0 ? totalRows : 0,
            companies,
          };
        })
        .filter(Boolean)
    : [];
  if (!message && conflicts.length === 0) return null;
  return { message, conflicts };
}

function formatConflictCompanies(companies) {
  if (!Array.isArray(companies) || companies.length === 0) return '';
  return companies
    .map((company) => {
      if (!company || company.companyId === undefined || company.companyId === null)
        return '';
      const idText = String(company.companyId);
      const rows = Number(company.rows);
      return Number.isFinite(rows) && rows > 0 ? `${idText} (${rows})` : idText;
    })
    .filter((text) => text !== '')
    .join(', ');
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
  const [exportingDefaults, setExportingDefaults] = useState(false);
  const [selectedTables, setSelectedTables] = useState({});
  const [tableRecords, setTableRecords] = useState({});
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [expandedTable, setExpandedTable] = useState(null);
  const [defaultRows, setDefaultRows] = useState({});
  const [lastResetSummary, setLastResetSummary] = useState(null);
  const [lastSeedSummary, setLastSeedSummary] = useState(null);
  const [seedDefaultsConflict, setSeedDefaultsConflict] = useState(null);
  const [recoverModalOpen, setRecoverModalOpen] = useState(false);
  const [snapshotList, setSnapshotList] = useState([]);
  const [snapshotListLoading, setSnapshotListLoading] = useState(false);
  const [snapshotListError, setSnapshotListError] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState('');
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState(null);
  const lastToggleFieldRef = useRef({});
  const { addToast } = useToast();
  const { t } = useContext(I18nContext);
  const location = useLocation();
  const navigate = useNavigate();
  const sharedSeedingHelpText = t(
    'sharedTablesSeedingHelp',
    'Shared tables always read from tenant key 0, so they cannot participate in per-company seeding.',
  );
  const sharedSeedingConflictMessage = t(
    'sharedTablesSeedingConflict',
    'Shared tables always read from tenant key 0, so they cannot participate in per-company seeding.',
  );
  const sharedToggleWarningMessage = t(
    'sharedTablesShareToggleWarning',
    'Shared tables cannot also enable Seed on Create. Seed on Create has been turned off.',
  );
  const seedToggleWarningMessage = t(
    'sharedTablesSeedToggleWarning',
    'Seed on Create is only available when Shared is off. Shared has been turned off.',
  );

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

  const resetTables = Array.isArray(lastResetSummary?.tables)
    ? lastResetSummary.tables
    : [];
  const resetTotals = lastResetSummary?.totals || {};
  const processedTables = Number(resetTotals?.tablesProcessed ?? 0);
  const totalRowsProcessed = Number(resetTotals?.totalRows ?? 0);
  const updatedRowsTotal = Number(resetTotals?.updatedRows ?? 0);
  const skippedRowsTotal = Number(resetTotals?.skippedRows ?? 0);
  const displayedResetEntries = resetTables.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const total = Number(entry?.totalRows ?? 0);
    const updated = Number(entry?.updatedRows ?? 0);
    const skipped = Number(entry?.skippedRows ?? 0);
    return total > 0 || updated > 0 || skipped > 0;
  });
  const normalizedResetEntries = displayedResetEntries
    .map((entry) => ({
      tableName:
        typeof entry?.tableName === 'string' ? entry.tableName : '',
      totalRows: Number(entry?.totalRows ?? 0),
      updatedRows: Number(entry?.updatedRows ?? 0),
      skippedRows: Number(entry?.skippedRows ?? 0),
    }))
    .filter((entry) => entry.tableName);
  const skippedTableRecords = resetTables
    .map((entry) => {
      const tableName =
        typeof entry?.tableName === 'string' ? entry.tableName : '';
      const records = Array.isArray(entry?.skippedRecords)
        ? entry.skippedRecords.map((rec) =>
            rec && typeof rec === 'object' ? { ...rec } : {},
          )
        : [];
      return { tableName, records };
    })
    .filter((entry) => entry.tableName && entry.records.length > 0);
  const hasSkippedRows = skippedTableRecords.length > 0;
  const resetTimestampText = (() => {
    const raw = lastResetSummary?.timestamp;
    if (!raw || typeof raw !== 'string') return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  })();

  function collectSkippedRowsForExport() {
    const rows = [];
    for (const { tableName, records } of skippedTableRecords) {
      for (const record of records) {
        rows.push({ table: tableName, ...(record || {}) });
      }
    }
    return rows;
  }

  function formatCsvValue(value) {
    if (value === null || value === undefined) return '';
    let str;
    if (value instanceof Date) {
      str = value.toISOString();
    } else if (typeof value === 'object') {
      try {
        str = JSON.stringify(value);
      } catch {
        str = String(value);
      }
    } else {
      str = String(value);
    }
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleDownloadSkippedJson() {
    if (!hasSkippedRows) return;
    try {
      const exportData = {};
      for (const { tableName, records } of skippedTableRecords) {
        exportData[tableName] = records;
      }
      downloadFile(
        `skipped-tenant-rows-${Date.now()}.json`,
        JSON.stringify(exportData, null, 2),
        'application/json',
      );
    } catch (err) {
      addToast(
        `${t('exportFailed', 'Failed to export skipped rows')}: ${err.message}`,
        'error',
      );
    }
  }

  function handleDownloadSkippedCsv() {
    if (!hasSkippedRows) return;
    try {
      const rows = collectSkippedRowsForExport();
      if (rows.length === 0) {
        addToast(
          t('noSkippedRowsToExport', 'No skipped rows to export.'),
          'info',
        );
        return;
      }
      const columnNames = new Set();
      rows.forEach((row) => {
        Object.keys(row || {}).forEach((col) => {
          columnNames.add(col);
        });
      });
      const orderedColumns = Array.from(columnNames).sort((a, b) => {
        if (a === 'table') return -1;
        if (b === 'table') return 1;
        return a.localeCompare(b);
      });
      const lines = [];
      lines.push(orderedColumns.map((col) => formatCsvValue(col)).join(','));
      rows.forEach((row) => {
        lines.push(
          orderedColumns
            .map((col) => formatCsvValue(row[col]))
            .join(','),
        );
      });
      downloadFile(
        `skipped-tenant-rows-${Date.now()}.csv`,
        lines.join('\n'),
        'text/csv;charset=utf-8;',
      );
    } catch (err) {
      addToast(
        `${t('exportFailed', 'Failed to export skipped rows')}: ${err.message}`,
        'error',
      );
    }
  }

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

  async function loadSnapshotList() {
    setSnapshotListLoading(true);
    setSnapshotListError('');
    try {
      const res = await fetch('/api/tenant_tables/default-snapshots', {
        credentials: 'include',
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to load snapshots');
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      const data = await res.json();
      const items = Array.isArray(data?.snapshots)
        ? data.snapshots.filter((snap) => snap && typeof snap.fileName === 'string')
        : [];
      setSnapshotList(items);
      setSelectedSnapshot((prev) => {
        if (prev && items.some((item) => item.fileName === prev)) {
          return prev;
        }
        return items[0]?.fileName ?? '';
      });
    } catch (err) {
      setSnapshotList([]);
      setSelectedSnapshot('');
      setSnapshotListError(err.message);
    } finally {
      setSnapshotListLoading(false);
    }
  }

  function openRecoverDefaultsModal() {
    setRestoreSummary(null);
    setRecoverModalOpen(true);
    loadSnapshotList();
  }

  function closeRecoverDefaultsModal() {
    setRecoverModalOpen(false);
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
      lastToggleFieldRef.current = {};
    } else {
      setTables([]);
      lastToggleFieldRef.current = {};
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
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      const data = await res.json();
      if (data && typeof data === 'object') {
        setLastResetSummary(data);
      } else {
        setLastResetSummary(null);
      }
      const totals = data?.totals || {};
      const updatedCount = Number(totals?.updatedRows ?? totals?.updated ?? 0);
      const skippedCount = Number(totals?.skippedRows ?? totals?.skipped ?? 0);
      const parts = [];
      if (Number.isFinite(updatedCount)) {
        parts.push(`${t('updated', 'Updated')}: ${updatedCount}`);
      }
      if (Number.isFinite(skippedCount)) {
        parts.push(`${t('skipped', 'Skipped')}: ${skippedCount}`);
      }
      let toastMessage = t(
        'resetSharedTenantTableKeys',
        'Reset shared tenant table keys',
      );
      if (parts.length > 0) {
        toastMessage = `${toastMessage} (${parts.join(', ')})`;
      }
      addToast(toastMessage, 'success');
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
        if (res.status === 409) {
          const fallbackMessage = t(
            'seedDefaultsConflictMessage',
            'Tenant data detected in seed tables. Clear tenant data before retrying.',
          );
          let normalized = null;
          try {
            const data = await res.clone().json();
            normalized = normalizeSeedDefaultsConflict(data);
          } catch {
            normalized = null;
          }
          if (!normalized) {
            const msg = await parseErrorBody(res);
            const message = msg || fallbackMessage;
            setSeedDefaultsConflict({ message, conflicts: [] });
            addToast(message, 'warning');
            return;
          }
          const message = normalized.message || fallbackMessage;
          setSeedDefaultsConflict({
            message,
            conflicts: normalized.conflicts || [],
          });
          addToast(message, 'warning');
          return;
        }
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to seed defaults');
      }
      setSeedDefaultsConflict(null);
      addToast(t('populatedDefaultsTenantKey0', 'Populated defaults (tenant key 0)'), 'success');
      await loadTables();
    } catch (err) {
      addToast(`Failed to seed defaults: ${err.message}`, 'error');
    } finally {
      setSeedingDefaults(false);
    }
  }

  async function handleExportDefaults() {
    const promptLabel = t(
      'exportDefaultsPrompt',
      'Enter a name for this defaults snapshot',
    );
    const input = window.prompt(promptLabel, '');
    if (input === null) {
      return;
    }
    const trimmed = String(input).trim();
    if (!trimmed) {
      addToast(t('exportNameRequired', 'Export name is required.'), 'warning');
      return;
    }
    setExportingDefaults(true);
    try {
      const res = await fetch('/api/tenant_tables/export-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ versionName: trimmed }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to export defaults');
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      const data = await res.json();
      const fallbackName = `tenant-defaults-${Date.now()}.sql`;
      const fileName =
        typeof data?.fileName === 'string' && data.fileName.trim()
          ? data.fileName
          : fallbackName;
      if (typeof data?.sql === 'string' && data.sql.trim()) {
        downloadFile(fileName, data.sql, 'application/sql;charset=utf-8;');
      }
      const tableCount = Number(data?.tableCount);
      const rowCount = Number(data?.rowCount);
      const summaryParts = [];
      if (Number.isFinite(tableCount)) {
        summaryParts.push(
          tableCount === 1
            ? t('oneTableExported', '1 table')
            : t('tableCountExported', '{{count}} tables', { count: tableCount }),
        );
      }
      if (Number.isFinite(rowCount)) {
        summaryParts.push(
          rowCount === 1
            ? t('oneRowExported', '1 row')
            : t('rowCountExported', '{{count}} rows', { count: rowCount }),
        );
      }
      let successMessage = t('defaultsExported', 'Defaults saved');
      if (summaryParts.length > 0) {
        successMessage = `${successMessage} (${summaryParts.join(', ')})`;
      }
      if (typeof data?.relativePath === 'string' && data.relativePath) {
        successMessage = `${successMessage} — ${data.relativePath}`;
      }
      addToast(successMessage, 'success');
    } catch (err) {
      addToast(
        `${t('exportFailed', 'Failed to export defaults')}: ${err.message}`,
        'error',
      );
    } finally {
      setExportingDefaults(false);
    }
  }

  async function handleRestoreDefaultsConfirm() {
    if (!selectedSnapshot) {
      addToast(
        t('selectSnapshotToRecover', 'Select a snapshot to recover first.'),
        'warning',
      );
      return;
    }
    setRestoringDefaults(true);
    setRestoreSummary(null);
    try {
      const res = await fetch('/api/tenant_tables/restore-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fileName: selectedSnapshot }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to recover defaults');
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`Unexpected response: ${ct || 'unknown content-type'}`);
      }
      const summary = await res.json();
      setRestoreSummary(summary);
      const tableCount = Number(summary?.tableCount);
      const insertedRows = Number(summary?.totalInserted);
      const summaryParts = [];
      if (Number.isFinite(tableCount)) {
        summaryParts.push(
          tableCount === 1
            ? t('oneTableProcessed', '1 table')
            : t('tableCountProcessed', '{{count}} tables', { count: tableCount }),
        );
      }
      if (Number.isFinite(insertedRows)) {
        summaryParts.push(
          insertedRows === 1
            ? t('oneRowInserted', '1 row')
            : t('rowCountInserted', '{{count}} rows', { count: insertedRows }),
        );
      }
      let toastMessage = t('defaultsRestored', 'Defaults restored');
      if (summaryParts.length > 0) {
        toastMessage = `${toastMessage} (${summaryParts.join(', ')})`;
      }
      addToast(toastMessage, 'success');
      await loadTables();
      const tablesToRefresh = Object.keys(defaultRows || {});
      for (const tableName of tablesToRefresh) {
        await loadDefaultRows(tableName);
      }
    } catch (err) {
      addToast(
        `${t('restoreDefaultsFailed', 'Failed to recover defaults')}: ${err.message}`,
        'error',
      );
    } finally {
      setRestoringDefaults(false);
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

  function handleSelectAllRows(table) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const rows = Array.isArray(info.rows) ? info.rows : [];
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const newRows = Array.isArray(editable.newRows)
        ? editable.newRows.map((row) => ({
            ...row,
            selected: rowHasValues(row.values),
          }))
        : [];
      const selectedRowIds = rows
        .map((row) => row?.id)
        .filter((id) => id !== undefined);
      return {
        ...prev,
        [table]: {
          ...info,
          selected: new Set(selectedRowIds),
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows,
          },
        },
      };
    });
  }

  function handleDeselectAllRows(table) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const newRows = Array.isArray(editable.newRows)
        ? editable.newRows.map((row) => ({
            ...row,
            selected: false,
          }))
        : [];
      return {
        ...prev,
        [table]: {
          ...info,
          selected: new Set(),
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows,
          },
        },
      };
    });
  }

  function handleDraftChange(table, id, field, value) {
    if (field === 'company_id' || isAuditColumn(field)) {
      return;
    }
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const key = formatRowIdKey(id);
      const currentDraft =
        editable.draftsById?.[key] || createEditableCopy(
          info.rows.find((row) => formatRowIdKey(row.id) === key) || {},
          info.columns,
        );
      const updatedDraft = { ...currentDraft, [field]: value };
      return {
        ...prev,
        [table]: {
          ...info,
          editable: {
            draftsById: { ...editable.draftsById, [key]: updatedDraft },
            newRows: [...(editable.newRows || [])],
          },
        },
      };
    });
  }

  function handleAddCustomRow(table) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const values = {};
      for (const column of info.columns || []) {
        if (column === 'company_id' || isAuditColumn(column)) continue;
        values[column] = '';
      }
      const newRow = {
        key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        values,
        selected: true,
      };
      return {
        ...prev,
        [table]: {
          ...info,
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows: [...(editable.newRows || []), newRow],
          },
        },
      };
    });
  }

  function handleNewRowChange(table, rowKey, field, value) {
    if (field === 'company_id' || isAuditColumn(field)) {
      return;
    }
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const newRows = (editable.newRows || []).map((row) => {
        if (row.key !== rowKey) return row;
        return {
          ...row,
          values: { ...(row.values || {}), [field]: value },
        };
      });
      return {
        ...prev,
        [table]: {
          ...info,
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows,
          },
        },
      };
    });
  }

  function handleToggleNewRowSelect(table, rowKey, checked) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const newRows = (editable.newRows || []).map((row) =>
        row.key === rowKey ? { ...row, selected: checked } : row,
      );
      return {
        ...prev,
        [table]: {
          ...info,
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows,
          },
        },
      };
    });
  }

  function handleRemoveNewRow(table, rowKey) {
    setTableRecords((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const editable = info.editable || { draftsById: {}, newRows: [] };
      const newRows = (editable.newRows || []).filter((row) => row.key !== rowKey);
      return {
        ...prev,
        [table]: {
          ...info,
          editable: {
            draftsById: { ...(editable.draftsById || {}) },
            newRows,
          },
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
        editable: { draftsById: {}, newRows: [] },
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
      const draftsById = {};
      for (const row of recs) {
        const key = formatRowIdKey(row.id);
        draftsById[key] = createEditableCopy(row, colNames);
      }
      setTableRecords((prev) => ({
        ...prev,
        [table]: {
          loading: false,
          columns: colNames,
          rows: recs,
          selected,
          editable: { draftsById, newRows: [] },
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
          editable: { draftsById: {}, newRows: [] },
        },
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
    const records = [];
    for (const tableName of tables) {
      const info = tableRecords[tableName];
      if (!info) continue;
      const selectedIds = Array.from(info.selected || []);
      const columns = info.columns || [];
      const draftsById = info.editable?.draftsById || {};
      const originalRows = info.rows || [];
      const originalByKey = new Map(
        originalRows.map((row) => [formatRowIdKey(row.id), row]),
      );
      const newRows = (info.editable?.newRows || []).filter(
        (row) => row.selected && rowHasValues(row.values),
      );
      let requiresManualRows = newRows.length > 0;
      for (const id of selectedIds) {
        const key = formatRowIdKey(id);
        const original = originalByKey.get(key);
        if (!original) continue;
        const draft = draftsById[key] || createEditableCopy(original, columns);
        if (hasRowChanges(original, draft, columns)) {
          requiresManualRows = true;
          break;
        }
      }

      if (requiresManualRows) {
        const manualRows = [];
        for (const id of selectedIds) {
          const key = formatRowIdKey(id);
          const original = originalByKey.get(key);
          if (!original) continue;
          const draft = draftsById[key] || createEditableCopy(original, columns);
          const manual = buildManualRowFromDraft(original, draft, columns);
          if (Object.keys(manual).length > 0) {
            manualRows.push(manual);
          }
        }
        for (const row of newRows) {
          const manual = buildManualRowForNew(row.values, columns);
          if (Object.keys(manual).length > 0) {
            manualRows.push(manual);
          }
        }
        if (manualRows.length > 0) {
          records.push({ table: tableName, rows: manualRows });
        }
      } else {
        if (selectedIds.length > 0) {
          records.push({ table: tableName, ids: selectedIds });
        }
      }
    }
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
      [table]: {
        loading: true,
        error: '',
        rows: [],
        columnNames: [],
        displayColumns: [],
        primaryKeys: [],
        draftsById: {},
        newRows: [],
        saving: {},
        deleting: {},
        supportsEditing: true,
      },
    }));
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
      const columnNames = cols.map((c) => c.name);
      const primaryKeys = cols
        .filter((c) => c && c.key === 'PRI')
        .map((c) => c.name)
        .filter(Boolean);
      const displayColumns = columnNames.filter(
        (name) => name !== 'company_id' && !isAuditColumn(name),
      );
      const supportsEditing = primaryKeys.length > 0 && displayColumns.length > 0;
      const rows = (rowsData.rows || []).map((r) => {
        const obj = {};
        columnNames.forEach((name, idx) => {
          obj[name] =
            r[name] !== undefined ? r[name] : Array.isArray(r) ? r[idx] : undefined;
        });
        return obj;
      });
      const normalizedRows = rows.map((values, index) => {
        const identifier = supportsEditing
          ? buildRowIdentifier(values, primaryKeys)
          : null;
        const key =
          identifier !== null && identifier !== undefined
            ? formatRowIdKey(identifier)
            : `row-${index}`;
        return { id: identifier, key, values };
      });
      const draftsById = {};
      for (const row of normalizedRows) {
        if (!row || !row.key) continue;
        draftsById[row.key] = createEditableCopy(row.values, columnNames);
      }
      setDefaultRows((prev) => ({
        ...prev,
        [table]: {
          loading: false,
          error: '',
          rows: normalizedRows,
          columnNames,
          displayColumns,
          primaryKeys,
          draftsById,
          newRows: [],
          saving: {},
          deleting: {},
          supportsEditing,
        },
      }));
    } catch (err) {
      addToast(`Failed to load defaults for ${table}: ${err.message}`, 'error');
      setDefaultRows((prev) => ({
        ...prev,
        [table]: {
          loading: false,
          error: err.message,
          rows: [],
          columnNames: [],
          displayColumns: [],
          primaryKeys: [],
          draftsById: {},
          newRows: [],
          saving: {},
          deleting: {},
          supportsEditing: false,
        },
      }));
    }
  }

  function handleDefaultDraftChange(table, rowKey, field, value) {
    if (field === 'company_id' || isAuditColumn(field)) {
      return;
    }
    setDefaultRows((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const row = info.rows?.find((r) => r.key === rowKey);
      if (!row) return prev;
      const columnNames = info.columnNames || Object.keys(row.values || {});
      const currentDraft =
        info.draftsById?.[rowKey] || createEditableCopy(row.values, columnNames);
      const updatedDraft = { ...currentDraft, [field]: value };
      return {
        ...prev,
        [table]: {
          ...info,
          draftsById: { ...(info.draftsById || {}), [rowKey]: updatedDraft },
        },
      };
    });
  }

  function handleDefaultRowReset(table, rowKey) {
    setDefaultRows((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const row = info.rows?.find((r) => r.key === rowKey);
      if (!row) return prev;
      const columnNames = info.columnNames || Object.keys(row.values || {});
      const draft = createEditableCopy(row.values, columnNames);
      return {
        ...prev,
        [table]: {
          ...info,
          draftsById: { ...(info.draftsById || {}), [rowKey]: draft },
        },
      };
    });
  }

  async function handleDefaultRowSave(table, rowKey) {
    const info = defaultRows[table];
    if (!info) return;
    const row = info.rows?.find((r) => r.key === rowKey);
    if (!row) {
      addToast(t('defaultRowNotFound', 'Default row not found.'), 'error');
      return;
    }
    if (!row.id) {
      addToast(
        t(
          'defaultRowMissingIdentifier',
          'Cannot update this row because its primary key is missing.',
        ),
        'error',
      );
      return;
    }
    const columnNames = info.columnNames || Object.keys(row.values || {});
    const draft =
      info.draftsById?.[rowKey] || createEditableCopy(row.values, columnNames);
    const manual = buildManualRowFromDraft(row.values, draft, columnNames);
    if (Object.keys(manual).length === 0) {
      addToast(t('noChangesToSave', 'No changes to save.'), 'info');
      return;
    }
    setDefaultRows((prev) => {
      const current = prev[table];
      if (!current) return prev;
      return {
        ...prev,
        [table]: {
          ...current,
          saving: { ...(current.saving || {}), [rowKey]: true },
        },
      };
    });
    try {
      const res = await fetch(
        `/api/tenant_tables/${encodeURIComponent(table)}/default-rows/${encodeURIComponent(row.id)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(manual),
        },
      );
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to update default row');
      }
      addToast(t('defaultRowSaved', 'Default row updated'), 'success');
      await loadDefaultRows(table);
    } catch (err) {
      addToast(`Failed to update default row: ${err.message}`, 'error');
    } finally {
      setDefaultRows((prev) => {
        const current = prev[table];
        if (!current) return prev;
        const nextSaving = { ...(current.saving || {}) };
        delete nextSaving[rowKey];
        return {
          ...prev,
          [table]: { ...current, saving: nextSaving },
        };
      });
    }
  }

  async function handleDefaultRowDelete(table, rowKey) {
    const info = defaultRows[table];
    if (!info) return;
    const row = info.rows?.find((r) => r.key === rowKey);
    if (!row) {
      addToast(t('defaultRowNotFound', 'Default row not found.'), 'error');
      return;
    }
    if (!row.id) {
      addToast(
        t(
          'defaultRowMissingIdentifier',
          'Cannot update this row because its primary key is missing.',
        ),
        'error',
      );
      return;
    }
    setDefaultRows((prev) => {
      const current = prev[table];
      if (!current) return prev;
      return {
        ...prev,
        [table]: {
          ...current,
          deleting: { ...(current.deleting || {}), [rowKey]: true },
        },
      };
    });
    try {
      const res = await fetch(
        `/api/tenant_tables/${encodeURIComponent(table)}/default-rows/${encodeURIComponent(row.id)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to delete default row');
      }
      addToast(t('defaultRowDeleted', 'Default row deleted'), 'success');
      await loadDefaultRows(table);
    } catch (err) {
      addToast(`Failed to delete default row: ${err.message}`, 'error');
    } finally {
      setDefaultRows((prev) => {
        const current = prev[table];
        if (!current) return prev;
        const nextDeleting = { ...(current.deleting || {}) };
        delete nextDeleting[rowKey];
        return {
          ...prev,
          [table]: { ...current, deleting: nextDeleting },
        };
      });
    }
  }

  function handleAddDefaultRow(table) {
    setDefaultRows((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const displayColumns = info.displayColumns || [];
      const values = {};
      displayColumns.forEach((col) => {
        values[col] = '';
      });
      const newRow = {
        key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        values,
        saving: false,
      };
      return {
        ...prev,
        [table]: {
          ...info,
          newRows: [...(info.newRows || []), newRow],
        },
      };
    });
  }

  function handleDefaultNewRowChange(table, rowKey, field, value) {
    if (field === 'company_id' || isAuditColumn(field)) {
      return;
    }
    setDefaultRows((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const newRows = (info.newRows || []).map((row) =>
        row.key === rowKey
          ? { ...row, values: { ...(row.values || {}), [field]: value } }
          : row,
      );
      return {
        ...prev,
        [table]: {
          ...info,
          newRows,
        },
      };
    });
  }

  function handleDefaultNewRowCancel(table, rowKey) {
    setDefaultRows((prev) => {
      const info = prev[table];
      if (!info) return prev;
      const newRows = (info.newRows || []).filter((row) => row.key !== rowKey);
      return {
        ...prev,
        [table]: {
          ...info,
          newRows,
        },
      };
    });
  }

  async function handleDefaultNewRowSave(table, rowKey) {
    const info = defaultRows[table];
    if (!info) return;
    const row = (info.newRows || []).find((r) => r.key === rowKey);
    if (!row) return;
    const columnNames = info.columnNames || [];
    const payload = buildManualRowForNew(row.values, columnNames);
    if (Object.keys(payload).length === 0) {
      addToast(
        t('defaultRowRequiresValues', 'Enter at least one value before saving.'),
        'warning',
      );
      return;
    }
    setDefaultRows((prev) => {
      const current = prev[table];
      if (!current) return prev;
      const newRows = (current.newRows || []).map((r) =>
        r.key === rowKey ? { ...r, saving: true } : r,
      );
      return {
        ...prev,
        [table]: {
          ...current,
          newRows,
        },
      };
    });
    try {
      const res = await fetch(
        `/api/tenant_tables/${encodeURIComponent(table)}/default-rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        throw new Error(msg || 'Failed to add default row');
      }
      addToast(t('defaultRowAdded', 'Default row added'), 'success');
      setDefaultRows((prev) => {
        const current = prev[table];
        if (!current) return prev;
        const newRows = (current.newRows || []).filter((r) => r.key !== rowKey);
        return {
          ...prev,
          [table]: {
            ...current,
            newRows,
          },
        };
      });
      await loadDefaultRows(table);
    } catch (err) {
      addToast(`Failed to add default row: ${err.message}`, 'error');
      setDefaultRows((prev) => {
        const current = prev[table];
        if (!current) return prev;
        const newRows = (current.newRows || []).map((r) =>
          r.key === rowKey ? { ...r, saving: false } : r,
        );
        return {
          ...prev,
          [table]: {
            ...current,
            newRows,
          },
        };
      });
    }
  }

  function handleChange(idx, field, value) {
    const table = Array.isArray(tables) ? tables[idx] : null;
    const warnOnSeedToggle =
      field === 'seedOnCreate' && value === true && table?.isShared;
    const warnOnSharedToggle =
      field === 'isShared' && value === true && table?.seedOnCreate;
    let tableKey = '';
    if (typeof table?.tableName === 'string' && table.tableName !== '') {
      tableKey = table.tableName;
    } else if (Number.isInteger(idx) && idx >= 0) {
      tableKey = `__index_${idx}`;
    }
    if (tableKey) {
      lastToggleFieldRef.current[tableKey] = field;
    }
    setTables((prevTables) => updateTablesWithChange(prevTables, idx, field, value));
    if (warnOnSeedToggle) {
      addToast(seedToggleWarningMessage, 'warning');
    } else if (warnOnSharedToggle) {
      addToast(sharedToggleWarningMessage, 'warning');
    }
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
    if (row.isShared && row.seedOnCreate) {
      let tableKey = '';
      if (typeof row?.tableName === 'string' && row.tableName) {
        tableKey = row.tableName;
      } else if (Array.isArray(tables)) {
        const index = tables.indexOf(row);
        if (index >= 0) {
          tableKey = `__index_${index}`;
        }
      }
      const lastField = tableKey ? lastToggleFieldRef.current[tableKey] : undefined;
      const message =
        lastField === 'seedOnCreate'
          ? seedToggleWarningMessage
          : lastField === 'isShared'
          ? sharedToggleWarningMessage
          : sharedSeedingConflictMessage;
      if (tableKey) {
        delete lastToggleFieldRef.current[tableKey];
      }
      addToast(message, 'warning');
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
        <button onClick={handleExportDefaults} disabled={exportingDefaults}>
          {exportingDefaults ? t('saving', 'Saving...') : t('saveDefaults', 'Save defaults')}
        </button>
        <button onClick={openRecoverDefaultsModal} disabled={restoringDefaults}>
          {restoringDefaults
            ? t('restoringDefaults', 'Restoring...')
            : t('recoverDefaults', 'Recover defaults')}
        </button>
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
      <p style={{ marginTop: '0.75rem', color: '#374151', maxWidth: '60ch' }}>
        {sharedSeedingHelpText}
      </p>
      {seedDefaultsConflict ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '4px',
          }}
        >
          <strong>{t('seedDefaultsConflictTitle', 'Global default seeding blocked')}</strong>
          <p style={{ margin: '0.5rem 0 0' }}>
            {seedDefaultsConflict.message ||
              t(
                'seedDefaultsConflictMessage',
                'Tenant data detected in seed tables. Clear tenant data before retrying.',
              )}
          </p>
          {Array.isArray(seedDefaultsConflict.conflicts) &&
          seedDefaultsConflict.conflicts.length > 0 ? (
            <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
              {seedDefaultsConflict.conflicts.map((conflict) => {
                const safeRows = Number(conflict?.rows);
                const count = Number.isFinite(safeRows) && safeRows > 0 ? safeRows : 0;
                const companiesText = formatConflictCompanies(conflict?.companies);
                return (
                  <li key={conflict.table}>
                    {conflict.table}: {count}
                    {companiesText ? ` (${companiesText})` : ''}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p style={{ margin: '0.5rem 0 0' }}>
            {t(
              'seedDefaultsConflictAdvice',
              'Back up or clear tenant data for the listed company IDs before retrying.',
            )}
          </p>
        </div>
      ) : null}
      {lastResetSummary ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            backgroundColor: '#ecfeff',
            border: '1px solid #38bdf8',
            borderRadius: '4px',
          }}
        >
          <strong>{t('lastTenantKeyReset', 'Last tenant key reset')}</strong>
          {resetTimestampText ? (
            <p style={{ margin: '0.25rem 0 0', color: '#1f2937' }}>
              {t('completedAt', 'Completed at')}: {resetTimestampText}
            </p>
          ) : null}
          <p style={{ margin: '0.5rem 0 0' }}>
            {t('tablesProcessed', 'Tables processed')}: {
              Number.isFinite(processedTables) ? processedTables : 0
            }
            {' · '}
            {t('totalRows', 'Total rows')}: {
              Number.isFinite(totalRowsProcessed) ? totalRowsProcessed : 0
            }
            {' · '}
            {t('updatedRows', 'Updated rows')}: {
              Number.isFinite(updatedRowsTotal) ? updatedRowsTotal : 0
            }
            {' · '}
            {t('skippedRows', 'Skipped rows')}: {
              Number.isFinite(skippedRowsTotal) ? skippedRowsTotal : 0
            }
          </p>
          {normalizedResetEntries.length > 0 ? (
            <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
              {normalizedResetEntries.map((entry) => {
                const hasSkip = entry.skippedRows > 0;
                return (
                  <li key={entry.tableName}>
                    <span style={{ fontWeight: 600 }}>{entry.tableName}</span>: {t('totalRows', 'Total rows')}:{' '}
                    {entry.totalRows}, {t('updated', 'Updated')}: {entry.updatedRows}, {' '}
                    <span style={{ color: hasSkip ? '#b91c1c' : 'inherit' }}>
                      {t('skipped', 'Skipped')}: {entry.skippedRows}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ margin: '0.5rem 0 0' }}>
              {t(
                'resetTenantKeysNoActivity',
                'No tenant-specific rows required updating.',
              )}
            </p>
          )}
          {hasSkippedRows ? (
            <>
              <p style={{ margin: '0.75rem 0 0' }}>
                {t(
                  'resetTenantKeysSkippedAdvice',
                  'Download skipped records to reconcile tenant-specific rows before retrying.',
                )}
              </p>
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={handleDownloadSkippedCsv}
                  disabled={resetting || !hasSkippedRows}
                >
                  {t('downloadSkippedCsv', 'Download skipped records (CSV)')}
                </button>
                <button
                  onClick={handleDownloadSkippedJson}
                  disabled={resetting || !hasSkippedRows}
                >
                  {t('downloadSkippedJson', 'Download skipped records (JSON)')}
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: '0.75rem 0 0' }}>
              {t(
                'resetTenantKeysNoSkips',
                'All shared rows were updated successfully.',
              )}
            </p>
          )}
        </div>
      ) : null}
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
            {tables.map((table, idx) => {
              const conflict = !!(table.isShared && table.seedOnCreate);
              return (
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
                      {conflict ? (
                        <div
                          style={{
                            marginTop: '0.25rem',
                            color: '#b91c1c',
                            fontSize: '0.875rem',
                          }}
                        >
                          {sharedSeedingConflictMessage}
                        </div>
                      ) : null}
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => handleSave(table)}
                        disabled={saving[table.tableName] || conflict}
                        title={conflict ? sharedSeedingConflictMessage : undefined}
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
                        {(() => {
                          const info = defaultRows[table.tableName] || {};
                          if (info.loading) {
                            return <p>{t('loading', 'Loading...')}</p>;
                          }
                          if (info.error) {
                            return <p>Error: {info.error}</p>;
                          }
                          const displayColumns = info.displayColumns || [];
                          const columnNames = info.columnNames || [];
                          const viewColumns = info.supportsEditing !== false
                            ? displayColumns
                            : columnNames;
                          const rows = Array.isArray(info.rows) ? info.rows : [];
                          const newRows = Array.isArray(info.newRows) ? info.newRows : [];
                          const draftsById = info.draftsById || {};
                          const saving = info.saving || {};
                          const deleting = info.deleting || {};
                          const supportsEditing = info.supportsEditing !== false;
                          const showActions = supportsEditing;
                          const hasRows = rows.length > 0;

                          if (!hasRows && !showActions) {
                            return (
                              <div>
                                <p>{t('noRecords', 'No records')}</p>
                                <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                                  <button onClick={() => setExpandedTable(null)}>
                                    {t('collapse', 'Collapse')}
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div>
                              {supportsEditing ? null : (
                                <p style={{ marginBottom: '0.5rem', color: '#6b7280' }}>
                                  {t(
                                    'defaultRowsReadOnly',
                                    'Editing is unavailable because editable columns or a primary key could not be determined.',
                                  )}
                                </p>
                              )}
                              {hasRows || (showActions && newRows.length > 0) ? (
                                <div>
                                  {viewColumns.length > 0 ? (
                                    <table
                                      style={{ width: '100%', borderCollapse: 'collapse' }}
                                    >
                                      <thead>
                                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                                          {viewColumns.map((c) => (
                                            <th key={c} style={styles.th}>
                                              {c}
                                            </th>
                                          ))}
                                          {showActions ? (
                                            <th style={styles.th}>{t('actions', 'Actions')}</th>
                                          ) : null}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rows.map((row) => {
                                          const rowKey = row.key;
                                          const draft =
                                            draftsById[rowKey] ||
                                            createEditableCopy(row.values, columnNames);
                                          const hasChanges = hasRowChanges(
                                            row.values,
                                            draft,
                                            columnNames,
                                          );
                                          const isSaving = !!saving[rowKey];
                                          const isDeleting = !!deleting[rowKey];
                                          const disableActions =
                                            !supportsEditing || !row.id || isSaving || isDeleting;
                                          return (
                                            <tr key={rowKey}>
                                              {viewColumns.map((c) => {
                                                const isPrimary =
                                                  (info.primaryKeys || []).includes(c);
                                                if (!supportsEditing || isPrimary) {
                                                  return (
                                                    <td key={c} style={styles.td}>
                                                      {convertRowValueToString(row.values?.[c])}
                                                    </td>
                                                  );
                                                }
                                                return (
                                                  <td key={c} style={styles.td}>
                                                    <input
                                                      type="text"
                                                      value={draft?.[c] ?? ''}
                                                      onChange={(e) =>
                                                        handleDefaultDraftChange(
                                                          table.tableName,
                                                          rowKey,
                                                          c,
                                                          e.target.value,
                                                        )
                                                      }
                                                      disabled={disableActions}
                                                      style={{ width: '100%' }}
                                                    />
                                                  </td>
                                                );
                                              })}
                                              {showActions ? (
                                                <td style={styles.td}>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleDefaultRowSave(
                                                        table.tableName,
                                                        rowKey,
                                                      )
                                                    }
                                                    disabled={disableActions || !hasChanges}
                                                  >
                                                    {isSaving
                                                      ? t('saving', 'Saving...')
                                                      : t('save', 'Save')}
                                                  </button>{' '}
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleDefaultRowReset(
                                                        table.tableName,
                                                        rowKey,
                                                      )
                                                    }
                                                    disabled={disableActions || !hasChanges}
                                                  >
                                                    {t('reset', 'Reset')}
                                                  </button>{' '}
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleDefaultRowDelete(
                                                        table.tableName,
                                                        rowKey,
                                                      )
                                                    }
                                                    disabled={disableActions}
                                                  >
                                                    {isDeleting
                                                      ? t('deleting', 'Deleting...')
                                                      : t('delete', 'Delete')}
                                                  </button>
                                                </td>
                                              ) : null}
                                            </tr>
                                          );
                                        })}
                                        {showActions
                                          ? newRows.map((row) => (
                                              <tr key={row.key}>
                                                {displayColumns.map((c) => (
                                                  <td key={c} style={styles.td}>
                                                    <input
                                                      type="text"
                                                      value={row.values?.[c] ?? ''}
                                                      onChange={(e) =>
                                                        handleDefaultNewRowChange(
                                                          table.tableName,
                                                          row.key,
                                                          c,
                                                          e.target.value,
                                                        )
                                                      }
                                                      disabled={row.saving}
                                                      style={{ width: '100%' }}
                                                    />
                                                  </td>
                                                ))}
                                                <td style={styles.td}>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleDefaultNewRowSave(
                                                        table.tableName,
                                                        row.key,
                                                      )
                                                    }
                                                    disabled={row.saving || !rowHasValues(row.values)}
                                                  >
                                                    {row.saving
                                                      ? t('saving', 'Saving...')
                                                      : t('save', 'Save')}
                                                  </button>{' '}
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      handleDefaultNewRowCancel(
                                                        table.tableName,
                                                        row.key,
                                                      )
                                                    }
                                                    disabled={row.saving}
                                                  >
                                                    {t('cancel', 'Cancel')}
                                                  </button>
                                                </td>
                                              </tr>
                                            ))
                                          : null}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p>{t('defaultRowsNoColumns', 'No columns available to display.')}</p>
                                  )}
                                  {showActions ? (
                                    <div style={{ marginTop: '0.5rem' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleAddDefaultRow(table.tableName)}
                                        disabled={!supportsEditing}
                                      >
                                        {t('addRow', 'Add row')}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div>
                                  <p>{t('noRecords', 'No records')}</p>
                                  {showActions ? (
                                    <div style={{ marginTop: '0.5rem' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleAddDefaultRow(table.tableName)}
                                        disabled={!supportsEditing}
                                      >
                                        {t('addRow', 'Add row')}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                              <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                                <button onClick={() => setExpandedTable(null)}>
                                  {t('collapse', 'Collapse')}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                    </td>
                  </tr>
                  )}
                </React.Fragment>
              );
            })}
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
                      {(() => {
                        const info = tableRecords[table.tableName];
                        const bulkDisabled = !info || !!info?.loading;
                        const bulkButtons = (
                          <div
                            style={{
                              marginBottom: '0.5rem',
                              display: 'flex',
                              gap: '0.5rem',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectAllRows(table.tableName)}
                              disabled={bulkDisabled}
                            >
                              {t('selectAll', 'Select all')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeselectAllRows(table.tableName)}
                              disabled={bulkDisabled}
                            >
                              {t('deselectAll', 'Deselect all')}
                            </button>
                          </div>
                        );
                        if (!info || info.loading) {
                          return (
                            <div>
                              {bulkButtons}
                              <p>{t('loading', 'Loading...')}</p>
                            </div>
                          );
                        }
                        if (!info.columns || !info.rows) {
                          return (
                            <div>
                              {bulkButtons}
                              <p>
                                {t(
                                  'loadFailed',
                                  `Failed to load records for ${table.tableName}`,
                                )}
                              </p>
                            </div>
                          );
                        }
                        const columnNames = info.columns || [];
                        const displayColumns = columnNames.filter(
                          (col) => col !== 'company_id' && !isAuditColumn(col),
                        );
                        const draftsById = info.editable?.draftsById || {};
                        const newRows = Array.isArray(info.editable?.newRows)
                          ? info.editable.newRows
                          : [];
                        const rows = Array.isArray(info.rows) ? info.rows : [];
                        const hasRows = rows.length > 0;
                        const hasCustomRows = newRows.length > 0;
                        if (!hasRows && !hasCustomRows) {
                          return (
                            <div>
                              {bulkButtons}
                              <div>
                                <p>{t('noRecords', 'No records')}</p>
                                <div style={{ marginTop: '0.5rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleAddCustomRow(table.tableName)}
                                  >
                                    {t('addCustomRow', 'Add custom row')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div>
                            {bulkButtons}
                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                              <thead>
                                <tr>
                                  <th style={styles.th}></th>
                                  {displayColumns.map((c) => (
                                    <th key={c} style={styles.th}>
                                      {c}
                                    </th>
                                  ))}
                                  <th style={styles.th}>{t('actions', 'Actions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => {
                                  const rowKey = formatRowIdKey(r.id);
                                  const draft =
                                    draftsById[rowKey] || createEditableCopy(r, columnNames);
                                  return (
                                    <tr key={rowKey}>
                                      <td style={styles.td}>
                                        <input
                                          type="checkbox"
                                          checked={!!info.selected?.has(r.id)}
                                          onChange={(e) =>
                                            handleRecordSelect(
                                              table.tableName,
                                              r.id,
                                              e.target.checked,
                                            )
                                          }
                                        />
                                      </td>
                                      {displayColumns.map((c) => (
                                        <td key={c} style={styles.td}>
                                          <input
                                            type="text"
                                            value={draft?.[c] ?? ''}
                                            onChange={(e) =>
                                              handleDraftChange(
                                                table.tableName,
                                                r.id,
                                                c,
                                                e.target.value,
                                              )
                                            }
                                            style={{ width: '100%' }}
                                          />
                                        </td>
                                      ))}
                                      <td style={styles.td}></td>
                                    </tr>
                                  );
                                })}
                                {newRows.map((row) => (
                                  <tr key={row.key}>
                                    <td style={styles.td}>
                                      <input
                                        type="checkbox"
                                        checked={!!row.selected}
                                        onChange={(e) =>
                                          handleToggleNewRowSelect(
                                            table.tableName,
                                            row.key,
                                            e.target.checked,
                                          )
                                        }
                                      />
                                    </td>
                                    {displayColumns.map((c) => (
                                      <td key={c} style={styles.td}>
                                        <input
                                          type="text"
                                          value={row.values?.[c] ?? ''}
                                          onChange={(e) =>
                                            handleNewRowChange(
                                              table.tableName,
                                              row.key,
                                              c,
                                              e.target.value,
                                            )
                                          }
                                          style={{ width: '100%' }}
                                        />
                                      </td>
                                    ))}
                                    <td style={styles.td}>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveNewRow(table.tableName, row.key)}
                                      >
                                        {t('remove', 'Remove')}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ marginTop: '0.5rem' }}>
                              <button
                                type="button"
                                onClick={() => handleAddCustomRow(table.tableName)}
                              >
                                {t('addCustomRow', 'Add custom row')}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
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
      <Modal
        visible={recoverModalOpen}
        title={t('recoverDefaultsTitle', 'Recover defaults from snapshot')}
        onClose={closeRecoverDefaultsModal}
        width="520px"
      >
        {snapshotListLoading ? (
          <p>{t('loading', 'Loading...')}</p>
        ) : snapshotListError ? (
          <div>
            <p style={{ color: '#b91c1c', marginBottom: '0.5rem' }}>{snapshotListError}</p>
            <button type="button" onClick={loadSnapshotList}>
              {t('retry', 'Retry')}
            </button>
          </div>
        ) : snapshotList.length === 0 ? (
          <p>{t('noSnapshotsFound', 'No default snapshots were found.')}</p>
        ) : (
          <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '0.75rem' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {snapshotList.map((snap) => {
                const displayLabel = snap.versionName || snap.fileName;
                const timestamp =
                  formatSnapshotTimestamp(
                    snap.generatedAt || snap.generatedAtRaw || snap.modifiedAt,
                  ) || '';
                const tableCount = Number(snap?.tableCount);
                const rowCount = Number(snap?.rowCount);
                return (
                  <li
                    key={snap.fileName}
                    style={{ padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb' }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="recover-default-snapshot"
                        value={snap.fileName}
                        checked={selectedSnapshot === snap.fileName}
                        onChange={() => {
                          setSelectedSnapshot(snap.fileName);
                          setRestoreSummary(null);
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>{displayLabel}</div>
                        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                          {snap.fileName}
                          {timestamp ? ` • ${timestamp}` : ''}
                        </div>
                        <div
                          style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}
                        >
                          {t('tablesProcessed', 'Tables processed')}: {
                            Number.isFinite(tableCount) ? tableCount : 0
                          }
                          {' · '}
                          {t('rowsIncluded', 'Rows included')}: {
                            Number.isFinite(rowCount) ? rowCount : 0
                          }
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {restoreSummary ? (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              backgroundColor: '#ecfdf5',
              border: '1px solid #34d399',
              borderRadius: '4px',
            }}
          >
            <strong>{t('restoreCompleted', 'Restore completed')}</strong>
            <p style={{ margin: '0.5rem 0 0', color: '#065f46' }}>
              {t('tablesProcessed', 'Tables processed')}: {
                Number.isFinite(Number(restoreSummary?.tableCount))
                  ? Number(restoreSummary.tableCount)
                  : Array.isArray(restoreSummary?.tables)
                  ? restoreSummary.tables.length
                  : 0
              }
            </p>
            <p style={{ margin: '0.25rem 0 0', color: '#065f46' }}>
              {t('rowsInserted', 'Rows inserted')}: {
                Number.isFinite(Number(restoreSummary?.totalInserted))
                  ? Number(restoreSummary.totalInserted)
                  : 0
              }
            </p>
            {Number.isFinite(Number(restoreSummary?.totalDeleted)) &&
            Number(restoreSummary.totalDeleted) > 0 ? (
              <p style={{ margin: '0.25rem 0 0', color: '#065f46' }}>
                {t('rowsDeleted', 'Rows deleted')}: {Number(restoreSummary.totalDeleted)}
              </p>
            ) : null}
            {Array.isArray(restoreSummary?.tables) && restoreSummary.tables.length > 0 ? (
              <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
                {restoreSummary.tables.map((info) => {
                  const inserted = Number(info?.insertedRows ?? 0);
                  const deleted = Number(info?.deletedRows ?? 0);
                  const details = [];
                  details.push(
                    inserted === 1
                      ? t('oneRowInsertedShort', '1 inserted')
                      : t('rowCountInsertedShort', '{{count}} inserted', {
                          count: inserted,
                        }),
                  );
                  if (deleted > 0) {
                    details.push(
                      deleted === 1
                        ? t('oneRowDeleted', '1 deleted')
                        : t('rowCountDeleted', '{{count}} deleted', { count: deleted }),
                    );
                  }
                  const label = info?.tableName || t('unknownTable', 'Unknown table');
                  return (
                    <li key={`${info?.tableName || 'unknown'}-${details.join('-')}`}>
                      {label}: {details.join(', ')}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
          }}
        >
          <button type="button" onClick={closeRecoverDefaultsModal}>
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleRestoreDefaultsConfirm}
            disabled={!selectedSnapshot || restoringDefaults || snapshotListLoading}
          >
            {restoringDefaults
              ? t('restoringDefaults', 'Restoring...')
              : t('recoverDefaults', 'Recover defaults')}
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

