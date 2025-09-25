import React, {
  useEffect,
  useState,
  useRef,
  useContext,
  useMemo,
  useCallback,
} from 'react';
import formatTimestamp from '../utils/formatTimestamp.js';
import RowFormModal from '../components/RowFormModal.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import buildImageName from '../utils/buildImageName.js';
import slugify from '../utils/slugify.js';
import { debugLog } from '../utils/debug.js';
import { syncCalcFields } from '../utils/syncCalcFields.js';
import { fetchTriggersForTables } from '../utils/fetchTriggersForTables.js';

export { syncCalcFields };

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeValueForComparison(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
    return trimmed;
  }
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.getTime();
  return value;
}

function valuesApproximatelyEqual(a, b) {
  if (a === undefined && b === undefined) return true;
  const normA = normalizeValueForComparison(a);
  const normB = normalizeValueForComparison(b);
  if (normA === undefined && normB === undefined) return true;
  if (normA === undefined || normB === undefined) return false;
  if (typeof normA === 'number' && typeof normB === 'number') {
    return Math.abs(normA - normB) <= 1e-6;
  }
  return normA === normB;
}

function compareCellValues(actualContainer, expectedContainer, field) {
  const actualIsArray = Array.isArray(actualContainer);
  const expectedIsArray = Array.isArray(expectedContainer);

  if (actualIsArray || expectedIsArray) {
    const actualRows = actualIsArray ? actualContainer : [];
    const expectedRows = expectedIsArray ? expectedContainer : [];
    const max = Math.max(actualRows.length, expectedRows.length);

    for (let idx = 0; idx < max; idx += 1) {
      const actualRow = actualRows[idx];
      const expectedRow = expectedRows[idx];
      const actualValue = isPlainRecord(actualRow)
        ? actualRow[field]
        : undefined;
      const expectedValue = isPlainRecord(expectedRow)
        ? expectedRow[field]
        : undefined;

      if (!valuesApproximatelyEqual(actualValue, expectedValue)) {
        return {
          rowIndex: idx,
          actual: actualValue,
          expected: expectedValue,
        };
      }
    }

    return null;
  }

  if (isPlainRecord(actualContainer) || isPlainRecord(expectedContainer)) {
    const actualValue = isPlainRecord(actualContainer)
      ? actualContainer[field]
      : undefined;
    const expectedValue = isPlainRecord(expectedContainer)
      ? expectedContainer[field]
      : undefined;

    if (!valuesApproximatelyEqual(actualValue, expectedValue)) {
      return { actual: actualValue, expected: expectedValue };
    }
  }

  return null;
}

export function findCalcFieldMismatch(data, calcFields) {
  if (!Array.isArray(calcFields) || calcFields.length === 0) return null;

  const base = data && typeof data === 'object' ? data : {};
  const expected = syncCalcFields(base, calcFields);

  for (const map of calcFields) {
    const cells = Array.isArray(map?.cells)
      ? map.cells.filter(
          (cell) =>
            cell &&
            typeof cell.table === 'string' &&
            cell.table &&
            typeof cell.field === 'string' &&
            cell.field,
        )
      : [];

    if (cells.length < 2) continue;

    for (const cell of cells) {
      const actualContainer = base[cell.table];
      const expectedContainer = expected[cell.table];
      const mismatch = compareCellValues(actualContainer, expectedContainer, cell.field);

      if (mismatch) {
        return {
          map,
          table: cell.table,
          field: cell.field,
          ...mismatch,
        };
      }
    }
  }

  return null;
}


function isEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function hash(obj) {
  let str;
  try {
    str = JSON.stringify(obj);
  } catch {
    str = '';
  }
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function extractSessionFieldsFromConfig(config) {
  if (!config) return [];
  const fields = [];
  const seen = new Set();
  const addField = (table, field) => {
    if (!table || !field) return;
    const tableName = String(table);
    const fieldName = String(field);
    const key = `${tableName}::${fieldName}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ table: tableName, field: fieldName });
  };
  const isSessionField = (name) =>
    typeof name === 'string' && name.toLowerCase().includes('session');
  (config.calcFields || []).forEach((row = {}) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    if (cells.length === 0) return;
    const hasSessionField = cells.some((cell) => isSessionField(cell?.field));
    cells.forEach((cell = {}) => {
      if (!cell.table || !cell.field) return;
      if (hasSessionField || isSessionField(cell.field)) {
        addField(cell.table, cell.field);
      }
    });
  });
  (config.posFields || []).forEach((p = {}) => {
    const parts = Array.isArray(p.parts) ? p.parts : [];
    parts.forEach((part = {}) => {
      if (!part.table || !part.field) return;
      if (isSessionField(part.field)) {
        addField(part.table, part.field);
      }
    });
  });
  fields.sort((a, b) => {
    const tableA = a.table;
    const tableB = b.table;
    if (tableA === tableB) {
      return a.field.localeCompare(b.field);
    }
    return tableA.localeCompare(tableB);
  });
  return fields;
}

function parseErrorField(msg) {
  if (!msg) return null;
  let m = msg.match(/FOREIGN KEY \(`([^`]*)`\)/i);
  if (m) return m[1];
  m = msg.match(/column '([^']+)'/i);
  if (m) return m[1];
  m = msg.match(/for key '([^']+)'/i);
  if (m) return m[1];
  return null;
}

export function hasForeignKey(cols = []) {
  return cols.some(
    (c) =>
      c?.REFERENCED_TABLE_NAME ||
      c?.referenced_table_name ||
      c?.COLUMN_KEY === 'MUL' ||
      c?.column_key === 'MUL' ||
      c?.Key === 'MUL',
  );
}

export function shouldLoadRelations(formConfig, cols = []) {
  const hasView = formConfig
    ? Object.values(formConfig.viewSource || {}).some(Boolean)
    : false;
  return hasView || hasForeignKey(cols);
}

const arrayIndexPattern = /^(0|[1-9]\d*)$/;

function copyArrayMetadata(target, source) {
  if (!Array.isArray(target) || !Array.isArray(source)) return;
  Object.keys(source).forEach((key) => {
    if (!arrayIndexPattern.test(key)) {
      target[key] = source[key];
    }
  });
}

function cloneArrayWithMetadata(source) {
  if (!Array.isArray(source)) return [];
  const clone = source.slice();
  copyArrayMetadata(clone, source);
  return clone;
}

export function applySessionIdToTables(
  values,
  sessionId,
  sessionFieldsByTable = {},
  tableTypeMap = {},
) {
  if (!sessionId) return values;
  const entries = Object.entries(sessionFieldsByTable || {});
  if (entries.length === 0) return values;
  let nextVals = values || {};
  let mutated = false;
  entries.forEach(([tbl, fields]) => {
    if (!Array.isArray(fields) || fields.length === 0) return;
    const type = tableTypeMap[tbl] === 'multi' ? 'multi' : 'single';
    if (type === 'multi') {
      const existingContainer = nextVals[tbl];
      const currentRows = Array.isArray(existingContainer) ? existingContainer : [];
      let targetRows = currentRows;
      let tableChanged = false;

      if (currentRows.length > 0) {
        let rowsMutated = false;
        const updatedRows = currentRows.map((row) => {
          const baseRow =
            row && typeof row === 'object' && !Array.isArray(row) ? row : {};
          let newRow = baseRow;
          let rowChanged = row === null || row === undefined;
          fields.forEach((field) => {
            if ((newRow?.[field] ?? undefined) !== sessionId) {
              if (newRow === baseRow && !rowChanged) {
                newRow = { ...baseRow };
              }
              newRow[field] = sessionId;
              rowChanged = true;
            }
          });
          if (rowChanged) {
            rowsMutated = true;
            return newRow;
          }
          return row;
        });
        if (rowsMutated) {
          targetRows = updatedRows;
          tableChanged = true;
          if (Array.isArray(existingContainer)) {
            copyArrayMetadata(targetRows, existingContainer);
          }
        }
      }

      const ensureTargetArray = () => {
        if (!Array.isArray(targetRows)) {
          targetRows = [];
          tableChanged = true;
        } else if (!tableChanged && targetRows === currentRows) {
          targetRows = cloneArrayWithMetadata(currentRows);
          tableChanged = true;
        }
      };

      let metadataChanged = false;
      fields.forEach((field) => {
        const currentVal = targetRows?.[field];
        if (currentVal !== sessionId) {
          ensureTargetArray();
          targetRows[field] = sessionId;
          metadataChanged = true;
        }
      });

      if (tableChanged || metadataChanged) {
        if (!mutated) {
          nextVals = { ...nextVals };
          mutated = true;
        }
        nextVals[tbl] = targetRows;
      }
    } else {
      const currentRow = nextVals[tbl];
      const baseRow =
        currentRow && typeof currentRow === 'object' && !Array.isArray(currentRow)
          ? currentRow
          : {};
      let newRow = baseRow;
      let rowChanged = currentRow === undefined || currentRow === null;
      fields.forEach((field) => {
        if (newRow[field] !== sessionId) {
          if (newRow === baseRow && !rowChanged) {
            newRow = { ...baseRow };
          }
          newRow[field] = sessionId;
          rowChanged = true;
        }
      });
      if (rowChanged) {
        if (!mutated) {
          nextVals = { ...nextVals };
          mutated = true;
        }
        nextVals[tbl] = newRow;
      }
    }
  });
  return nextVals;
}

function PendingSelectModal({ visible, list = [], onSelect, onClose }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === 'ArrowDown') {
        setIdx((v) => Math.min(v + 1, list.length - 1));
      } else if (e.key === 'ArrowUp') {
        setIdx((v) => Math.max(v - 1, 0));
      } else if (e.key === 'Enter') {
        onSelect(list[idx]?.id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, list, idx, onSelect]);

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Select Pending" onClose={onClose}>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((rec, i) => (
          <li
            key={rec.id}
            style={{
              padding: '0.25rem 0.5rem',
              background: i === idx ? '#e0e0ff' : 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setIdx(i)}
            onClick={() => onSelect(rec.id)}
          >
            {rec.id} {rec.savedAt ? `(${rec.savedAt.slice(0, 19)})` : ''}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

async function postRow(addToast, table, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${
          field ? ` (field ${field}=${val})` : ''
        }`,
        'error',
      );
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return null;
  }
}

async function putRow(addToast, table, id, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${field ? ` (field ${field}=${val})` : ''}`,
        'error',
      );
      return false;
    }
    return true;
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return false;
  }
}

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const { user, company, branch } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const memoFormConfigs = useMemo(() => formConfigs, [formConfigs]);
  // Stable hash of view dependencies in form configs to keep loadView callback
  // from recreating unnecessarily when irrelevant parts mutate.
  const formConfigsViewHash = useMemo(() => {
    const entries = Object.entries(memoFormConfigs).map(([tbl, fc]) => {
      const views = Object.values(fc.viewSource || {})
        .filter(Boolean)
        .sort();
      return `${tbl}:${views.join(',')}`;
    });
    return entries.sort().join('|');
  }, [memoFormConfigs]);
  const [columnMeta, setColumnMeta] = useState({});
  const [values, setValues] = useState({});
  const [layout, setLayout] = useState({});
  const [relationsMap, setRelationsMap] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [relationData, setRelationData] = useState({});
  const [viewDisplaysMap, setViewDisplaysMap] = useState({});
  const [viewColumnsMap, setViewColumnsMap] = useState({});
  const [procTriggersMap, setProcTriggersMap] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [sessionFields, setSessionFields] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [masterId, setMasterId] = useState(null);
  const [pendingList, setPendingList] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [postedId, setPostedId] = useState(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const tableTypeMap = useMemo(() => {
    const map = {};
    if (!config) return map;
    if (config.masterTable) {
      map[config.masterTable] =
        config.masterType === 'multi' ? 'multi' : 'single';
    }
    (config.tables || []).forEach((t) => {
      if (!t?.table) return;
      map[t.table] = t.type === 'multi' ? 'multi' : 'single';
    });
    return map;
  }, [config]);
  const sessionFieldsKey = useMemo(() => {
    if (!sessionFields || sessionFields.length === 0) return '';
    return sessionFields
      .map((sf) => `${sf.table || ''}:${sf.field || ''}`)
      .sort()
      .join('|');
  }, [sessionFields]);
  const sessionFieldsByTable = useMemo(() => {
    const map = {};
    if (!sessionFields || sessionFields.length === 0) return map;
    sessionFields.forEach(({ table, field }) => {
      if (!table || !field) return;
      if (!map[table]) map[table] = [];
      if (!map[table].includes(field)) map[table].push(field);
    });
    return map;
  }, [sessionFieldsKey]);
  const applySessionIdToValues = useCallback(
    (vals, sid) => applySessionIdToTables(vals, sid, sessionFieldsByTable, tableTypeMap),
    [sessionFieldsByTable, tableTypeMap],
  );
  const masterIdRef = useRef(null);
  const refs = useRef({});
  const dragInfo = useRef(null);
  const relationCacheRef = useRef(new Map());
  const loadingTablesRef = useRef(new Set());
  const loadedTablesRef = useRef(new Set());
  const procTriggerFetchesRef = useRef(new Map());
  const procTriggerLoadedRef = useRef(new Set());
  const viewCacheRef = useRef(new Map());
  // Tracks in-flight view fetch promises so multiple tables can share them
  const viewFetchesRef = useRef(new Map());
  // Records view names that finished loading to avoid repeated network calls
  const viewLoadedRef = useRef(new Set());
  const contextReadyRef = useRef({ branch, company });
  const unmountedRef = useRef(false);
  const abortControllersRef = useRef(new Set());

  const fetchWithAbort = (url, options = {}) => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => {
      abortControllersRef.current.delete(controller);
    });
  };

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Abort pending requests and reset caches when the transaction name changes
  // to avoid leaking state between sessions.
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((c) => c.abort());
      abortControllersRef.current.clear();
      relationCacheRef.current.clear();
      loadingTablesRef.current.clear();
      viewCacheRef.current.clear();
      viewFetchesRef.current.clear();
      viewLoadedRef.current.clear();
      procTriggerFetchesRef.current.clear();
      procTriggerLoadedRef.current.clear();
    };
  }, [name]);

  useEffect(() => {
    const prev = contextReadyRef.current;
    const branchReady = branch != null && prev.branch == null;
    const companyReady = company != null && prev.company == null;
    contextReadyRef.current = { branch, company };
    if (!branchReady && !companyReady) return;

    const tables = Object.entries(memoFormConfigs);
    if (tables.length === 0) return;

    setValues((currentValues) => {
      if (!currentValues || typeof currentValues !== 'object') return currentValues;
      let mutated = false;
      let nextValues = currentValues;

      const fillRecord = (record, branchFields, companyFields) => {
        const base =
          record && typeof record === 'object' && !Array.isArray(record)
            ? record
            : {};
        let updated = base;
        let changed = false;
        const maybeAssign = (field, value) => {
          if (!field) return;
          const current = updated[field];
          if (current !== undefined && current !== null && current !== '') return;
          if (updated === base) {
            updated = { ...base };
          }
          updated[field] = value;
          changed = true;
        };
        if (branchReady && Array.isArray(branchFields) && branchFields.length > 0) {
          branchFields.forEach((field) => maybeAssign(field, branch));
        }
        if (companyReady && Array.isArray(companyFields) && companyFields.length > 0) {
          companyFields.forEach((field) => maybeAssign(field, company));
        }
        return { updated, changed };
      };

      tables.forEach(([tbl, fc]) => {
        if (!fc) return;
        const branchFields = Array.isArray(fc.branchIdFields)
          ? fc.branchIdFields
          : [];
        const companyFields = Array.isArray(fc.companyIdFields)
          ? fc.companyIdFields
          : [];
        if (
          (!branchReady || branchFields.length === 0) &&
          (!companyReady || companyFields.length === 0)
        ) {
          return;
        }

        const container = nextValues[tbl];
        const type = tableTypeMap[tbl] === 'multi' ? 'multi' : 'single';

        if (type === 'multi') {
          const currentRows = Array.isArray(container) ? container : [];
          let targetRows = currentRows;
          let tableChanged = false;
          const ensureClone = () => {
            if (!tableChanged) {
              targetRows = currentRows.slice();
              copyArrayMetadata(targetRows, currentRows);
              tableChanged = true;
            }
          };
          const maybeAssignArrayField = (fields, value) => {
            if (!Array.isArray(fields) || fields.length === 0) return;
            if (value === undefined || value === null) return;
            fields.forEach((field) => {
              if (!field) return;
              const holder = tableChanged ? targetRows : currentRows;
              const current = holder[field];
              if (current !== undefined && current !== null && current !== '') {
                return;
              }
              ensureClone();
              targetRows[field] = value;
            });
          };
          currentRows.forEach((row, idx) => {
            const { updated, changed } = fillRecord(row, branchFields, companyFields);
            if (changed) {
              ensureClone();
              targetRows[idx] = updated;
            }
          });
          if (Array.isArray(container)) {
            Object.keys(container).forEach((key) => {
              if (arrayIndexPattern.test(key)) return;
              const meta = container[key];
              if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
              const { updated, changed } = fillRecord(
                meta,
                branchFields,
                companyFields,
              );
              if (changed) {
                ensureClone();
                targetRows[key] = updated;
              }
            });
          }
          if (branchReady) {
            maybeAssignArrayField(branchFields, branch);
          }
          if (companyReady) {
            maybeAssignArrayField(companyFields, company);
          }
          if (tableChanged) {
            if (nextValues === currentValues) {
              nextValues = { ...currentValues };
            }
            nextValues[tbl] = targetRows;
            mutated = true;
          }
        } else {
          const source =
            container && typeof container === 'object' && !Array.isArray(container)
              ? container
              : {};
          const { updated, changed } = fillRecord(
            source,
            branchFields,
            companyFields,
          );
          if (changed) {
            if (nextValues === currentValues) {
              nextValues = { ...currentValues };
            }
            nextValues[tbl] = updated;
            mutated = true;
          }
        }
      });

      return mutated ? nextValues : currentValues;
    });
  }, [branch, company, memoFormConfigs, tableTypeMap]);

  async function loadRelations(tbl) {
    if (loadingTablesRef.current.has(tbl)) {
      return { dataMap: {}, cfgMap: {}, rowMap: {} };
    }
    loadingTablesRef.current.add(tbl);
    try {
      const res = await fetchWithAbort(`/api/tables/${encodeURIComponent(tbl)}/relations`, {
        credentials: 'include',
      });
      if (!res.ok) return { dataMap: {}, cfgMap: {}, rowMap: {} };
      const rels = await res.json().catch(() => []);
      const dataMap = {};
      const cfgMap = {};
      const rowMap = {};
      const tableCache = relationCacheRef.current;
      const relsByTable = rels.reduce((acc, r) => {
        const refTbl = r.REFERENCED_TABLE_NAME;
        if (!acc[refTbl]) acc[refTbl] = [];
        acc[refTbl].push(r);
        return acc;
      }, {});
      const perPage = 500;
      const maxPages = 20;
      for (const [refTbl, list] of Object.entries(relsByTable)) {
        let cached = tableCache.get(refTbl);
        if (!cached) {
          let cfg = null;
          try {
            const cRes = await fetchWithAbort(
              `/api/display_fields?table=${encodeURIComponent(refTbl)}`,
              { credentials: 'include', skipErrorToast: true },
            );
            if (cRes.ok) cfg = await cRes.json().catch(() => null);
          } catch {
            cfg = null;
          }
          let page = 1;
          let rows = [];
          while (page <= maxPages) {
            const params = new URLSearchParams({ page, perPage });
            const refRes = await fetchWithAbort(
              `/api/tables/${encodeURIComponent(refTbl)}?${params.toString()}`,
              { credentials: 'include', skipErrorToast: true },
            );
            if (!refRes.ok) break;
            const js = await refRes.json().catch(() => ({}));
            if (Array.isArray(js.rows)) {
              rows = rows.concat(js.rows);
              if (rows.length >= (js.count || rows.length) || js.rows.length < perPage) break;
            } else break;
            page += 1;
          }
          cached = { cfg, rows };
          tableCache.set(refTbl, cached);
        }
        const { cfg, rows } = cached;
        for (const r of list) {
          const refCol = r.REFERENCED_COLUMN_NAME;
          const opts = [];
          const rMap = {};
          rows.forEach((row) => {
            const val = row[refCol];
            const parts = [];
            if (val !== undefined) parts.push(val);
            let displayFields = [];
            if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
              displayFields = cfg.displayFields;
            } else {
              displayFields = Object.keys(row).filter((f) => f !== refCol).slice(0, 1);
            }
            parts.push(
              ...displayFields.map((f) => row[f]).filter((v) => v !== undefined),
            );
            const label = parts.join(' - ');
            opts.push({ value: val, label });
            rMap[val] = row;
          });
          if (opts.length > 0) dataMap[r.COLUMN_NAME] = opts;
          if (Object.keys(rMap).length > 0) rowMap[r.COLUMN_NAME] = rMap;
          cfgMap[r.COLUMN_NAME] = {
            table: refTbl,
            column: refCol,
            idField: cfg?.idField || refCol,
            displayFields: cfg?.displayFields || [],
          };
        }
      }
      return { dataMap, cfgMap, rowMap };
    } catch {
      /* ignore */
      return { dataMap: {}, cfgMap: {}, rowMap: {} };
    } finally {
      loadingTablesRef.current.delete(tbl);
    }
  }

  const loadView = useCallback(
    async (viewName) => {
      const apply = (data) => {
        Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
          const views = Object.values(fc.viewSource || {});
          if (views.includes(viewName)) {
            setViewDisplaysMap((m) => ({
              ...m,
              [tbl]: { ...(m[tbl] || {}), [viewName]: data.cfg },
            }));
            setViewColumnsMap((m) => ({
              ...m,
              [tbl]: { ...(m[tbl] || {}), [viewName]: data.cols },
            }));
          }
        });
      };
      if (viewLoadedRef.current.has(viewName)) {
        const cached = viewCacheRef.current.get(viewName);
        if (cached) apply(cached);
        return cached;
      }
      const cached = viewCacheRef.current.get(viewName);
      if (cached) {
        apply(cached);
        viewLoadedRef.current.add(viewName);
        return cached;
      }
      let fetchPromise = viewFetchesRef.current.get(viewName);
      if (!fetchPromise) {
        const dfPromise = fetchWithAbort(
          `/api/display_fields?table=${encodeURIComponent(viewName)}`,
          { credentials: 'include' },
        ).then((res) => (res.ok ? res.json() : null));
        const colPromise = fetchWithAbort(
          `/api/tables/${encodeURIComponent(viewName)}/columns`,
          { credentials: 'include' },
        ).then((res) => (res.ok ? res.json() : []));
        fetchPromise = Promise.all([dfPromise, colPromise])
          .then(([cfg, cols]) => {
            const data = {
              cfg: cfg || {},
              cols: (cols || []).map((c) => c.name),
            };
            viewCacheRef.current.set(viewName, data);
            return data;
          })
          .catch(() => null)
          .finally(() => {
            viewFetchesRef.current.delete(viewName);
          });
        viewFetchesRef.current.set(viewName, fetchPromise);
      }
      const data = await fetchPromise;
      if (data) {
        apply(data);
        viewLoadedRef.current.add(viewName);
      }
      return data;
    },
    [formConfigsViewHash],
  );

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  function focusFirst(table) {
    const wrap = refs.current[table];
    if (!wrap) return;
    const el = wrap.querySelector('input, textarea, select, button');
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));
  }, []);

  const initRef = useRef('');

  useEffect(() => {
    if (!name) {
      setConfig(null);
      setLayout({});
      setSessionFields(null);
      setCurrentSessionId(null);
      return;
    }
    setSessionFields(null);
    setCurrentSessionId(null);
    fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.tables) && cfg.tables.length > 0 && !cfg.masterTable) {
          const [master, ...rest] = cfg.tables;
          cfg = { ...cfg, masterTable: master.table || '', masterForm: master.form || '', masterType: master.type || 'single', masterPosition: master.position || 'upper_left', tables: rest };
        }
        setConfig(cfg);
        setFormConfigs((f) => (Object.keys(f).length ? {} : f));
        setValues({});
        setRelationsMap({});
        setRelationConfigs({});
        setRelationData({});
      })
      .catch(() => { setConfig(null); });
    fetch(`/api/pos_txn_layout?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .then(data => setLayout(data || {}))
      .catch(() => setLayout({}));
  }, [name]);

  const { formList, visibleTables } = React.useMemo(() => {
    if (!config) return { formList: [], visibleTables: new Set() };
    const arr = [
      { table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView },
      ...config.tables,
    ];
    const seen = new Set();
    const filtered = arr.filter((t) => {
      if (!t.table) return false;
      if (seen.has(t.table)) return false;
      seen.add(t.table);
      return true;
    });
    const visibleSet = new Set(
      filtered
        .filter((t) => t.position !== 'hidden')
        .map((t) => t.table),
    );
    const order = [
      'top_row',
      'upper_left',
      'upper_right',
      'left',
      'right',
      'lower_left',
      'lower_right',
      'bottom_row',
      'hidden',
    ];
    return {
      formList: filtered.sort(
        (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
      ),
      visibleTables: visibleSet,
    };
  }, [config]);

  // Stable key used for effect dependencies that care about visible table set
  const visibleTablesKey = React.useMemo(
    () => [...visibleTables].sort().join(','),
    [visibleTables],
  );

  // Stable version identifier derived from memoized form configs.
  const configVersion = React.useMemo(
    () => hash(memoFormConfigs),
    [memoFormConfigs],
  );

  const configVersionRef = useRef(configVersion);

  useEffect(() => {
    configVersionRef.current = configVersion;
  }, [configVersion]);

  useEffect(() => {
    procTriggerFetchesRef.current.clear();
    procTriggerLoadedRef.current.clear();
  }, [configVersion]);

  useEffect(() => {
    loadedTablesRef.current.clear();
    loadingTablesRef.current.clear();
  }, [visibleTablesKey, configVersion]);

  // Reload form configs and column metadata when either the visible table set
  // or the form identifiers change. Because configVersion ignores layout-only
  // changes, layout adjustments still avoid reloads.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const tables = [config.masterTable, ...config.tables.map((t) => t.table)];
    const forms = [config.masterForm || '', ...config.tables.map((t) => t.form)];

    async function loadAll() {
      const fcMap = {};
      const colMap = {};
      const relMap = {};
      const relCfgMap = {};
      const relDataMap = {};

      const uniqueTables = Array.from(
        new Set(tables.filter((tbl) => typeof tbl === 'string' && tbl)),
      );
      const versionAtStart = configVersionRef.current;

      fetchTriggersForTables({
        tables: uniqueTables,
        fetcher: async (tbl) => {
          try {
            const res = await fetchWithAbort(
              `/api/proc_triggers?table=${encodeURIComponent(tbl)}`,
              { credentials: 'include' },
            );
            if (!res.ok) return {};
            const js = await res.json().catch(() => ({}));
            return js || {};
          } catch {
            return {};
          }
        },
        fetchesRef: procTriggerFetchesRef,
        loadedRef: procTriggerLoadedRef,
        applyResult: (tbl, data) => {
          if (unmountedRef.current) return false;
          if (configVersionRef.current !== versionAtStart) return false;
          setProcTriggersMap((prev) => {
            const prevData = prev[tbl];
            const nextData = isPlainRecord(data) ? data : {};
            if (isEqual(prevData, nextData)) return prev;
            return { ...prev, [tbl]: nextData };
          });
          return true;
        },
      });

      await Promise.all(
        tables.map(async (tbl, idx) => {
          if (!tbl) return;

          const form = forms[idx];
          let cfg = null;
          if (form) {
            try {
              const res = await fetch(
                `/api/transaction_forms?table=${encodeURIComponent(tbl)}&name=${encodeURIComponent(form)}`,
                { credentials: 'include' },
              );
              cfg = res.ok ? await res.json().catch(() => null) : null;
            } catch {
              cfg = null;
            }
          }

          if (form) {
            fcMap[tbl] = cfg || {};
          } else if (!(tbl in fcMap)) {
            fcMap[tbl] = {};
          }

          if (!loadedTablesRef.current.has(tbl)) {
            try {
              const colRes = await fetchWithAbort(
                `/api/tables/${encodeURIComponent(tbl)}/columns`,
                { credentials: 'include' },
              );
              const cols = colRes.ok ? await colRes.json().catch(() => []) : [];
              colMap[tbl] = cols || [];
              if (shouldLoadRelations(cfg, cols)) {
                const { dataMap, cfgMap, rowMap } = await loadRelations(tbl);
                if (Object.keys(dataMap).length)
                  relMap[tbl] = dataMap;
                if (Object.keys(cfgMap).length)
                  relCfgMap[tbl] = cfgMap;
                if (Object.keys(rowMap).length)
                  relDataMap[tbl] = rowMap;
              } else {
                debugLog(`Skipping relations fetch for ${tbl}`);
              }
            } catch {
              /* ignore */
            } finally {
              loadedTablesRef.current.add(tbl);
            }
          }
        }),
      );

      if (cancelled) return;

      setFormConfigs((prev) => {
        let changed = false;
        const merged = { ...prev };
        Object.entries(fcMap).forEach(([tbl, cfg]) => {
          const prevCfg = prev[tbl];
          const nextCfg = cfg || {};
          if (!isEqual(prevCfg, nextCfg)) {
            merged[tbl] = nextCfg;
            changed = true;
          }
        });
        return changed ? merged : prev;
      });
      if (Object.keys(colMap).length)
        setColumnMeta((prev) => ({ ...prev, ...colMap }));
      if (Object.keys(relMap).length)
        setRelationsMap((prev) => ({ ...prev, ...relMap }));
      if (Object.keys(relCfgMap).length)
        setRelationConfigs((prev) => ({ ...prev, ...relCfgMap }));
      if (Object.keys(relDataMap).length)
        setRelationData((prev) => ({ ...prev, ...relDataMap }));
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [visibleTablesKey, configVersion]);

  const memoFieldTypeMap = useMemo(() => {
    const map = {};
    Object.entries(columnMeta).forEach(([tbl, cols]) => {
      if (!visibleTables.has(tbl)) return;
      const inner = {};
      cols.forEach((c) => {
        const typ = (
          c.type ||
          c.columnType ||
          c.dataType ||
          c.DATA_TYPE ||
          ''
        ).toLowerCase();
        if (typ.match(/int|decimal|numeric|double|float|real|number|bigint/)) {
          inner[c.name] = 'number';
        } else if (typ.includes('timestamp') || typ.includes('datetime')) {
          inner[c.name] = 'datetime';
        } else if (typ.includes('date')) {
          inner[c.name] = 'date';
        } else if (typ.includes('time')) {
          inner[c.name] = 'time';
        } else {
          inner[c.name] = 'string';
        }
      });
      map[tbl] = inner;
    });
    return map;
  }, [visibleTablesKey, configVersion, columnMeta]);

  const memoColumnCaseMap = useMemo(() => {
    const map = {};
    Object.entries(columnMeta).forEach(([tbl, cols]) => {
      if (!visibleTables.has(tbl)) return;
      const inner = {};
      cols.forEach((c) => {
        inner[c.name.toLowerCase()] = c.name;
      });
      map[tbl] = inner;
    });
    return map;
  }, [visibleTablesKey, configVersion, columnMeta]);

  const memoRelationConfigs = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (relationConfigs[tbl]) map[tbl] = relationConfigs[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, relationConfigs]);

  const memoRelationData = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (relationData[tbl]) map[tbl] = relationData[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, relationData]);

  const memoViewDisplaysMap = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (viewDisplaysMap[tbl]) map[tbl] = viewDisplaysMap[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, viewDisplaysMap]);

  const memoViewColumnsMap = useMemo(() => {
    const map = {};
    visibleTables.forEach((tbl) => {
      if (viewColumnsMap[tbl]) map[tbl] = viewColumnsMap[tbl];
    });
    return map;
  }, [visibleTablesKey, configVersion, viewColumnsMap]);

  useEffect(() => {
    if (!config) {
      setSessionFields(null);
      return;
    }
    setSessionFields(extractSessionFieldsFromConfig(config));
  }, [visibleTablesKey, configVersion, config]);

  const masterSessionValue = React.useMemo(() => {
    if (!config) return undefined;
    const masterSf = (sessionFields || []).find(
      (f) => f.table === config.masterTable,
    );
    if (!masterSf) return undefined;
    return values[config.masterTable]?.[masterSf.field];
  }, [values, config, sessionFieldsKey]);

  useEffect(() => {
    if (!masterSessionValue) return;
    setCurrentSessionId((prev) => (prev === masterSessionValue ? prev : masterSessionValue));
  }, [masterSessionValue]);

  useEffect(() => {
    if (!currentSessionId) return;
    setValues((prev) => applySessionIdToValues(prev, currentSessionId));
  }, [currentSessionId, applySessionIdToValues]);

  useEffect(() => {
    if (!config) return;
    if (sessionFields === null) return;
    const tables = [config.masterTable, ...config.tables.map((t) => t.table)];
    if (!tables.every((tbl) => memoFormConfigs[tbl])) return;
    const initKey = `${name}::${sessionFieldsKey}`;
    if (initRef.current === initKey) return;
    const prevKey = initRef.current;
    initRef.current = initKey;
    if (prevKey && prevKey.startsWith(`${name}::`) && currentSessionId) {
      setValues((prev) => applySessionIdToValues(prev, currentSessionId));
      return;
    }
    handleNew();
  }, [
    visibleTablesKey,
    configVersion,
    name,
    sessionFields,
    sessionFieldsKey,
    currentSessionId,
    applySessionIdToValues,
  ]);


  useEffect(() => {
    if (!config) return;
    if (masterSessionValue === undefined) return;
    const updateSessionValues = (prev) => {
      let next = prev;
      for (const sf of sessionFields || []) {
        if (sf.table === config.masterTable) continue;
        const tblVal = next[sf.table];
        if (Array.isArray(tblVal)) {
          let tableChanged = false;
          const updated = tblVal.map((r) => {
            if (r[sf.field] === masterSessionValue) return r;
            tableChanged = true;
            return { ...r, [sf.field]: masterSessionValue };
          });
          if (tableChanged) next = { ...next, [sf.table]: updated };
          continue;
        }
        const cur = tblVal?.[sf.field];
        if (cur !== masterSessionValue) {
          next = {
            ...next,
            [sf.table]: { ...(tblVal || {}), [sf.field]: masterSessionValue },
          };
        }
      }
      return next;
    };
    setValues(updateSessionValues);
  }, [masterSessionValue, visibleTablesKey, configVersion, sessionFieldsKey]);

  function applyPosFields(vals, posFieldConfig) {
    if (!Array.isArray(posFieldConfig)) return vals;
    let next = { ...vals };
    for (const pf of posFieldConfig) {
      const parts = Array.isArray(pf.parts) ? pf.parts : [];
      if (parts.length < 2) continue;
      const [target, ...calc] = parts;
      let val = 0;
      let init = false;
      for (const p of calc) {
        if (!p.table || !p.field) continue;
        const data = next[p.table];
        let num = 0;
        if (Array.isArray(data)) {
          if (p.agg === 'SUM' || p.agg === 'AVG') {
            const sum = data.reduce((s, r) => s + (Number(r?.[p.field]) || 0), 0);
            num = p.agg === 'AVG' ? (data.length ? sum / data.length : 0) : sum;
          } else {
            num = Number(data[0]?.[p.field]) || 0;
          }
        } else {
          num = Number(data?.[p.field]) || 0;
        }
        if (p.agg === '=' && !init) {
          val = num;
          init = true;
        } else if (p.agg === '+') {
          val += num;
        } else if (p.agg === '-') {
          val -= num;
        } else if (p.agg === '*') {
          val *= num;
        } else if (p.agg === '/') {
          val /= num;
        } else {
          val = num;
          init = true;
        }
      }
      if (!target.table || !target.field) continue;
      const tgt = next[target.table];
      if (Array.isArray(tgt)) {
        next[target.table] = tgt.map((r) => ({ ...r, [target.field]: val }));
      } else {
        next[target.table] = { ...(tgt || {}), [target.field]: val };
      }
    }
    return next;
  }

  function recalcTotals(vals) {
    if (!config || !config.masterTable) return vals;
    const totals = { total_quantity: 0, total_amount: 0, total_discount: 0 };
    for (const t of config.tables) {
      if (t.type !== 'multi') continue;
      const rows = Array.isArray(vals[t.table]) ? vals[t.table] : [];
      rows.forEach((r) => {
        Object.entries(r || {}).forEach(([k, v]) => {
          const key = k.toLowerCase();
          const num = Number(v) || 0;
          if (key.includes('qty')) totals.total_quantity += num;
          if (key.includes('amount') || key.includes('amt')) totals.total_amount += num;
          if (key.includes('discount') || key.includes('disc')) totals.total_discount += num;
        });
      });
    }
    const masterTbl = config.masterTable;
    const next = {
      ...vals,
      [masterTbl]: { ...(vals[masterTbl] || {}), ...totals },
    };
    return applyPosFields(next, config.posFields);
  }

  const hasData = React.useMemo(() => {
    return Object.values(values).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v && Object.keys(v).length > 0;
    });
  }, [values]);

  function handleChange(tbl, changes) {
    setValues((v) => {
      let next = { ...v, [tbl]: { ...v[tbl], ...changes } };
      next = syncCalcFields(next, config?.calcFields);
      next = applyPosFields(next, config?.posFields);
      return recalcTotals(next);
    });
  }

  function handleRowsChange(tbl, rows) {
    setValues((v) => {
      let next = { ...v, [tbl]: Array.isArray(rows) ? rows : [] };
      const sid = currentSessionId || masterSessionValue;
      if (sid) {
        next = applySessionIdToValues(next, sid);
      }
      next = syncCalcFields(next, config?.calcFields);
      next = applyPosFields(next, config?.posFields);
      return recalcTotals(next);
    });
  }

  async function handleSubmit(tbl, row) {
    const js = await postRow(addToast, tbl, row);
    if (js) addToast('Saved', 'success');
  }

  async function handleSaveLayout() {
    if (!name) return;
    const info = {};
    const list = [
      { table: config.masterTable },
      ...config.tables,
    ];
    list.forEach((t) => {
      const el = refs.current[t.table];
      if (el) {
        info[t.table] = {
          width: el.offsetWidth,
          height: el.offsetHeight,
          x: layout[t.table]?.x || 0,
          y: layout[t.table]?.y || 0,
        };
      }
    });
    await fetch('/api/pos_txn_layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, layout: info }),
    });
    addToast('Layout saved', 'success');
  }

  async function handleNew() {
    if (!config) return;
    if ((pendingId || masterId) && hasData) {
      const save = window.confirm(
        'Save current transaction before starting new?',
      );
      if (save) await handleSavePending();
    }
    const sid = 'pos_' + Date.now().toString(36);
    let next = {};
    const allTables = [
      { table: config.masterTable, type: config.masterType },
      ...config.tables,
    ];
    allTables.forEach((t) => {
      next[t.table] = t.type === 'multi' ? [] : {};
    });
    next = applySessionIdToValues(next, sid);
    if (
      config.statusField?.table &&
      config.statusField.field &&
      config.statusField.created
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.created;
    }
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (next[tbl][k] === undefined) next[tbl][k] = v;
      });
      if (fc.userIdFields && user?.empid !== undefined) {
        fc.userIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = user.empid;
        });
      }
      if (fc.branchIdFields && branch != null) {
        fc.branchIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = branch;
        });
      }
      if (fc.companyIdFields && company != null) {
        fc.companyIdFields.forEach((f) => {
          if (next[tbl][f] === undefined) next[tbl][f] = company;
        });
      }
      if (fc.transactionTypeField && fc.transactionTypeValue) {
        if (next[tbl][fc.transactionTypeField] === undefined) {
          next[tbl][fc.transactionTypeField] = fc.transactionTypeValue;
        }
      }
      if (fc.dateField && Array.isArray(fc.dateField)) {
        const now = formatTimestamp(new Date()).slice(0, 10);
        fc.dateField.forEach((f) => {
          if (next[tbl][f] === undefined || next[tbl][f] === '') {
            next[tbl][f] = now;
          }
        });
      }
    });
    setCurrentSessionId(sid);
    setValues(next);
    setMasterId(null);
    masterIdRef.current = null;
    setPendingId(null);
    addToast('New transaction started', 'success');
  }

  async function handleSavePending() {
    if (!name) return;
    let next = { ...values };
    if (
      config?.statusField?.table &&
      config.statusField.field &&
      config.statusField.beforePost
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.beforePost;
    }
    // fill defaults and system fields when missing
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = Array.isArray(values[tbl]) ? [] : {};
      const applyDefaults = (row) => {
        const updated = { ...row };
        Object.entries(defs).forEach(([k, v]) => {
          if (updated[k] === undefined) updated[k] = v;
        });
        if (fc.userIdFields && user?.empid !== undefined) {
          fc.userIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = user.empid;
          });
        }
        if (fc.branchIdFields && branch != null) {
          fc.branchIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = branch;
          });
        }
        if (fc.companyIdFields && company != null) {
          fc.companyIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = company;
          });
        }
        if (fc.transactionTypeField && fc.transactionTypeValue) {
          if (updated[fc.transactionTypeField] === undefined) {
            updated[fc.transactionTypeField] = fc.transactionTypeValue;
          }
        }
        return updated;
      };
      if (Array.isArray(next[tbl])) {
        next[tbl] = next[tbl].map((row) => applyDefaults(row));
      } else {
        next[tbl] = applyDefaults(next[tbl]);
      }
    });

    const mid = masterIdRef.current;
    const masterSf = (sessionFields || []).find(
      (f) => f.table === config.masterTable,
    );
    let sid = masterSf ? next[config.masterTable]?.[masterSf.field] : null;
    if (!sid) {
      sid =
        currentSessionId ||
        pendingId ||
        'pos_' + Date.now().toString(36);
    }
    next = applySessionIdToValues(next, sid);

    const session = {
      employeeId: user?.empid,
      companyId: company,
      branchId: branch,
      date: formatTimestamp(new Date()),
    };
    try {
      const res = await fetch('/api/pos_txn_pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: sid, name, data: next, masterId: mid, session }),
      });
      const js = await res.json().catch(() => ({}));
      if (js.id) {
        setPendingId(sid);
        setValues(next);
        addToast('Saved', 'success');
      } else {
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Save failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  }

  async function handleLoadPending() {
    if (!name) return;
    const list = await fetch(
      `/api/pos_txn_pending?name=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
    const arr = Object.entries(list).map(([id, rec]) => ({ id, ...rec }));
    if (arr.length === 0) { addToast('No pending', 'info'); return; }
    setPendingList(arr);
    setShowLoadModal(true);
  }

  async function selectPending(id) {
    setShowLoadModal(false);
    if (!id) return;
    const rec = await fetch(
      `/api/pos_txn_pending?id=${encodeURIComponent(id)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    if (rec && rec.data) {
      setValues(rec.data);
      setPendingId(String(id).trim());
      setMasterId(rec.masterId || null);
      masterIdRef.current = rec.masterId || null;
      const masterSf = (sessionFields || []).find(
        (f) => f.table === config?.masterTable,
      );
      if (masterSf) {
        const sid = rec.data?.[config.masterTable]?.[masterSf.field];
        setCurrentSessionId(sid || null);
      }
      addToast('Loaded', 'success');
    } else {
      addToast('Load failed', 'error');
    }
  }

  async function handleDeletePending() {
    if (!pendingId) return;
    if (!window.confirm('Delete pending transaction?')) return;
    try {
      const res = await fetch(
        `/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        addToast(js.message || 'Delete failed', 'error');
        return;
      }
      setPendingId(null);
      setValues({});
      setMasterId(null);
      masterIdRef.current = null;
      setCurrentSessionId(null);
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  async function handlePostAll() {
    if (!name) return;
    // basic required field check
    for (const t of [{ table: config.masterTable }, ...config.tables]) {
      const fc = memoFormConfigs[t.table];
      if (!fc) continue;
      const req = fc.requiredFields || [];
      const row = values[t.table] || {};
      for (const f of req) {
        if (row[f] === undefined || row[f] === '') {
          addToast('Missing required fields', 'error');
          return;
        }
      }
    }
    let payload = applySessionIdToValues(
      { ...values },
      currentSessionId || masterSessionValue,
    );
    Object.entries(memoFormConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!payload[tbl]) payload[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (payload[tbl][k] === undefined) payload[tbl][k] = v;
      });
    });
    const mismatch = findCalcFieldMismatch(payload, config.calcFields);
    if (mismatch) {
      addToast('Mapping mismatch', 'error');
      return;
    }
    const single = {};
    const multi = {};
    formList.forEach((t) => {
      if (t.type === 'multi') multi[t.table] = payload[t.table];
      else single[t.table] = payload[t.table];
    });
    const postData = { masterId: masterIdRef.current, single, multi };
    const session = {
      employeeId: user?.empid,
      companyId: company,
      branchId: branch,
      date: formatTimestamp(new Date()),
    };
    try {
      const res = await fetch('/api/pos_txn_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, data: postData, session }),
      });
      if (res.ok) {
        if (pendingId) {
          await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
        setPendingId(null);
        const js = await res.json().catch(() => ({}));
        if (js.id) setPostedId(js.id);
        if (config.statusField?.table && config.statusField.field && config.statusField.posted) {
          setValues(v => ({
            ...v,
            [config.statusField.table]: {
              ...(v[config.statusField.table] || {}),
              [config.statusField.field]: config.statusField.posted,
            },
          }));
        }
        const imgCfg = memoFormConfigs[config.masterTable] || {};
        if (imgCfg.imageIdField) {
          const columnMap = (columnMeta[config.masterTable] || []).reduce(
            (m, c) => {
              m[c.name.toLowerCase()] = c.name;
              return m;
            },
            {},
          );
          const rowBefore = values[config.masterTable] || {};
          const oldImg =
            rowBefore._imageName ||
            buildImageName(rowBefore, imgCfg.imagenameField || [], columnMap).name;
          await new Promise((r) => setTimeout(r, 300));
          let rowAfter = rowBefore;
          try {
            const r2 = await fetch(
              `/api/tables/${encodeURIComponent(config.masterTable)}/${encodeURIComponent(js.id)}`,
              { credentials: 'include' },
            );
            if (r2.ok) {
              rowAfter = await r2.json().catch(() => rowBefore);
            }
          } catch {
            rowAfter = rowBefore;
          }
          const { name: newImg } = buildImageName(
            rowAfter,
            imgCfg.imagenameField || [],
            columnMap,
          );
          const t1 = rowAfter.trtype;
          const t2 =
            rowAfter.uitranstypename || rowAfter.transtype || rowAfter.transtypename;
          const folder = t1 && t2
            ? `${slugify(t1)}/${slugify(String(t2))}`
            : config.masterTable;
          if (oldImg && newImg && oldImg !== newImg) {
            const renameUrl =
              `/api/transaction_images/${config.masterTable}/${encodeURIComponent(oldImg)}/rename/${encodeURIComponent(newImg)}?folder=${encodeURIComponent(folder)}`;
            try {
              const rn = await fetch(renameUrl, {
                method: 'POST',
                credentials: 'include',
              });
              if (rn.ok) {
                const imgs = await rn.json().catch(() => []);
                (Array.isArray(imgs) ? imgs : []).forEach((p) =>
                  addToast(`Image saved: ${p}`, 'success'),
                );
              }
            } catch {
              /* ignore */
            }
          }
        }
        addToast('Posted', 'success');
      } else {
        const js = await res.json().catch(() => ({}));
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Post failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Post failed: ${err.message}`, 'error');
    }
  }

  function startDrag(table, e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const cur = layout[table] || {};
    dragInfo.current = { table, startX, startY, x: cur.x || 0, y: cur.y || 0 };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!dragInfo.current) return;
    const { table, startX, startY, x, y } = dragInfo.current;
    const nx = x + e.clientX - startX;
    const ny = y + e.clientY - startY;
    setLayout((l) => ({ ...l, [table]: { ...l[table], x: nx, y: ny } }));
  }

  function endDrag() {
    dragInfo.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }
  const configNames = Object.keys(configs);

  return (
    <div>
      <h2>{config?.label || 'POS Transactions'}</h2>
      {configNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select
            value={name}
            onChange={e => {
              const newName = e.target.value;
              setName(newName);
              initRef.current = '';
            }}
          >
            <option value="">-- select config --</option>
            {configNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {config && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleSaveLayout}>Save Layout</button>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleNew} style={{ marginRight: '0.5rem' }}>New</button>
            <button onClick={handleSavePending} style={{ marginRight: '0.5rem' }} disabled={!name || !hasData}>Save</button>
            <button onClick={handleLoadPending} style={{ marginRight: '0.5rem' }} disabled={!name}>Load</button>
            <button onClick={handleDeletePending} style={{ marginRight: '0.5rem' }} disabled={!pendingId}>Delete</button>
            <button onClick={handlePostAll} disabled={!name}>POST</button>
          </div>
          {(pendingId || postedId) && (
            <div style={{ marginBottom: '0.5rem' }}>
              {pendingId && <span style={{ marginRight: '1rem' }}>Pending ID: {pendingId}</span>}
              {postedId && <span>Posted ID: {postedId}</span>}
            </div>
          )}
          <div
            style={
              isNarrow
                ? { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
                : {
                    display: 'grid',
                    gap: '0',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridTemplateRows: 'auto auto auto auto auto',
                  }
            }
          >
            {formList
              .filter(t => t.position !== 'hidden')
              .map((t, idx) => {
                const fc = memoFormConfigs[t.table];
                if (!fc) return <div key={idx}>Loading...</div>;
                const meta = columnMeta[t.table] || [];
                const labels = {};
                meta.forEach((c) => {
                  labels[c.name || c] = c.label || c.name || c;
                });
                const visible = Array.isArray(fc.visibleFields)
                  ? fc.visibleFields
                  : [];
                const headerFields =
                  fc.headerFields && fc.headerFields.length > 0
                    ? fc.headerFields
                    : [];
                const mainFields =
                  fc.mainFields && fc.mainFields.length > 0
                    ? fc.mainFields
                    : [];
                const footerFields =
                  fc.footerFields && fc.footerFields.length > 0
                    ? fc.footerFields
                    : [];
                const provided = Array.isArray(fc.editableFields)
                  ? fc.editableFields
                  : [];
                const defaults = Array.isArray(fc.editableDefaultFields)
                  ? fc.editableDefaultFields
                  : [];
                const editVals = Array.from(new Set([...defaults, ...provided]));
                const editSet =
                  editVals.length > 0
                    ? new Set(editVals.map((f) => f.toLowerCase()))
                    : null;
                const allFields = Array.from(
                  new Set([...visible, ...headerFields, ...mainFields, ...footerFields]),
                );
                const disabled = editSet
                  ? allFields.filter((c) => !editSet.has(c.toLowerCase()))
                  : [];
                const posStyle = {
                  top_row: { gridColumn: '1 / span 3', gridRow: '1' },
                  upper_left: { gridColumn: '1', gridRow: '2' },
                  upper_right: { gridColumn: '3', gridRow: '2' },
                  left: { gridColumn: '1', gridRow: '3' },
                  right: { gridColumn: '3', gridRow: '3' },
                  lower_left: { gridColumn: '1', gridRow: '4' },
                  lower_right: { gridColumn: '3', gridRow: '4' },
                  bottom_row: { gridColumn: '1 / span 3', gridRow: '5' },
                }[t.position] || { gridColumn: '2', gridRow: '3' };
                const saved = layout[t.table] || {};
                return (
                  <div
                    key={idx}
                    ref={(el) => (refs.current[t.table] = el)}
                    style={{
                      border: '1px solid #ccc',
                      resize: 'both',
                      overflow: 'auto',
                      width: saved.width || 'auto',
                      height: saved.height || 'auto',
                      margin: isNarrow ? '0 0 0.5rem 0' : '-1px',
                      transform: isNarrow
                        ? undefined
                        : `translate(${saved.x || 0}px, ${saved.y || 0}px)`,
                      position: 'relative',
                      ...(isNarrow ? {} : posStyle),
                    }}
                  >
                    <h3
                      style={{ margin: '0.5rem', cursor: 'move' }}
                      onMouseDown={(e) => startDrag(t.table, e)}
                    >
                      {t.table}
                    </h3>
                    <RowFormModal
                      key={`rf-${t.table}-${generalConfig.pos.boxWidth}`}
                      inline
                      visible
                      columns={allFields}
                      disabledFields={disabled}
                      requiredFields={fc.requiredFields || []}
                      labels={labels}
                      row={values[t.table]}
                      rows={t.type === 'multi' ? values[t.table] : undefined}
                      headerFields={headerFields}
                      mainFields={mainFields}
                      footerFields={footerFields}
                      defaultValues={fc.defaultValues || {}}
                      table={config.masterTable}
                      imagenameField={
                        memoFormConfigs[config.masterTable]?.imagenameField || []
                      }
                      imageIdField={
                        memoFormConfigs[config.masterTable]?.imageIdField || ''
                      }
                      relations={relationsMap[t.table] || {}}
                      relationConfigs={memoRelationConfigs[t.table] || {}}
                      relationData={memoRelationData[t.table] || {}}
                      procTriggers={procTriggersMap[t.table] || {}}
                      viewSource={fc.viewSource || {}}
                      viewDisplays={memoViewDisplaysMap[t.table] || {}}
                      viewColumns={memoViewColumnsMap[t.table] || {}}
                      loadView={loadView}
                      user={user}
                      fieldTypeMap={memoFieldTypeMap[t.table] || {}}
                      columnCaseMap={memoColumnCaseMap[t.table] || {}}
                      onChange={(changes) => handleChange(t.table, changes)}
                      onRowsChange={(rows) => handleRowsChange(t.table, rows)}
                      onSubmit={() => true}
                      useGrid={t.view === 'table' || t.type === 'multi'}
                      fitted={t.view === 'fitted'}
                      scope="pos"
                      dateField={fc.dateField || []}
                      onNextForm={() => {
                        let next = idx + 1;
                        while (next < formList.length) {
                          const nf = memoFormConfigs[formList[next].table];
                          const provided = Array.isArray(nf?.editableFields)
                            ? nf.editableFields
                            : [];
                          const defaults = Array.isArray(nf?.editableDefaultFields)
                            ? nf.editableDefaultFields
                            : [];
                          const ed = Array.from(new Set([...defaults, ...provided]));
                          if (ed.length > 0) break;
                          next += 1;
                        }
                        if (next < formList.length) focusFirst(formList[next].table);
                      }}
                    />
                  </div>
                );
              })}
          </div>
          <PendingSelectModal
            visible={showLoadModal}
            list={pendingList}
            onSelect={selectPending}
            onClose={() => setShowLoadModal(false)}
          />
        </>
      )}
    </div>
  );
}
