import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { translateToMn } from '../utils/translateToMn.js';
import { useToast } from '../context/ToastContext.jsx';
import formatTimestamp from '../utils/formatTimestamp.js';

function cleanIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]+/g, '');
}

function normalizeField(name) {
  return cleanIdentifier(name).toLowerCase();
}

export default function CodingTablesPage() {
  const { addToast } = useToast();
  const [sheets, setSheets] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [headers, setHeaders] = useState([]);
  const [idCandidates, setIdCandidates] = useState([]);
  const [idFilterMode, setIdFilterMode] = useState('contains');
  const [headerRow, setHeaderRow] = useState(1);
  const [mnHeaderRow, setMnHeaderRow] = useState('');
  const [tableName, setTableName] = useState('');
  const [idColumn, setIdColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [otherColumns, setOtherColumns] = useState([]);
  const [uniqueFields, setUniqueFields] = useState([]);
  const [calcText, setCalcText] = useState('');
  const [sql, setSql] = useState('');
  const [sqlOther, setSqlOther] = useState('');
  const [structSql, setStructSql] = useState('');
  const [structSqlOther, setStructSqlOther] = useState('');
  const [recordsSql, setRecordsSql] = useState('');
  const [recordsSqlOther, setRecordsSqlOther] = useState('');
  const [preparedMainRows, setPreparedMainRows] = useState([]);
  const [preparedOtherRows, setPreparedOtherRows] = useState([]);
  const [preparedMainFieldTypes, setPreparedMainFieldTypes] = useState({});
  const [preparedOtherFieldTypes, setPreparedOtherFieldTypes] = useState({});
  const [triggerSql, setTriggerSql] = useState('');
  const [foreignKeySql, setForeignKeySql] = useState('');
  const [sqlMove, setSqlMove] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [insertedCount, setInsertedCount] = useState(0);
  const [groupMessage, setGroupMessage] = useState('');
  const [groupByField, setGroupByField] = useState('');
  const [groupSize, setGroupSize] = useState(300);
  const [columnTypes, setColumnTypes] = useState({});
  const [notNullMap, setNotNullMap] = useState({});
  const [allowZeroMap, setAllowZeroMap] = useState({});
  const [defaultValues, setDefaultValues] = useState({});
  const [defaultFrom, setDefaultFrom] = useState({});
  const [extraFields, setExtraFields] = useState(['']);
  const [headerMap, setHeaderMap] = useState({});
  const [renameMap, setRenameMap] = useState({});
  const [duplicateHeaders, setDuplicateHeaders] = useState(new Set());
  const [initialDuplicates, setInitialDuplicates] = useState(new Set());
  const [populateRange, setPopulateRange] = useState(false);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [autoIncStart, setAutoIncStart] = useState('1');
  const [duplicateInfo, setDuplicateInfo] = useState('');
  const [duplicateRecords, setDuplicateRecords] = useState('');
  const [summaryInfo, setSummaryInfo] = useState('');
  const [mainCount, setMainCount] = useState(0);
  const [otherCount, setOtherCount] = useState(0);
  const [dupCount, setDupCount] = useState(0);
  const [errorGroups, setErrorGroups] = useState({});
  const [insertedMain, setInsertedMain] = useState(0);
  const [insertedOther, setInsertedOther] = useState(0);
  const [unsuccessfulGroups, setUnsuccessfulGroups] = useState({});
  const [useStagingInsert, setUseStagingInsert] = useState(false);
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [configNames, setConfigNames] = useState([]);
  const [configMap, setConfigMap] = useState({});
  const interruptRef = useRef(false);
  const abortCtrlRef = useRef(null);
  const [loadingWorkbook, setLoadingWorkbook] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const workerRef = useRef(null);
  const sheetSelectedManuallyRef = useRef(false);
  const headerRowSelectedManuallyRef = useRef(false);
  const mnHeaderRowSelectedManuallyRef = useRef(false);

  useEffect(() => {
    fetch('/api/coding_table_configs', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        setConfigNames(Object.keys(data));
        setConfigMap(data);
      })
      .catch(() => {
        setConfigNames([]);
        setConfigMap({});
      });
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (uploading) {
          if (window.confirm('Interrupt insert process?')) {
            interruptRef.current = true;
            if (abortCtrlRef.current) abortCtrlRef.current.abort();
          }
        } else if (loadingWorkbook) {
          if (window.confirm('Cancel workbook load?')) {
            if (workerRef.current) workerRef.current.terminate();
            workerRef.current = null;
            setLoadingWorkbook(false);
            setLoadProgress(0);
          }
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [uploading, loadingWorkbook]);

  const allFields = useMemo(() => {
    // keep duplicates so user can easily spot them and clean extras the same way
    return [
      ...headers,
      ...extraFields
        .filter((f) => f.trim() !== '')
        .map((f) => cleanIdentifier(f)),
    ];
  }, [headers, extraFields]);

  const hasDateField = useMemo(
    () => allFields.some((h) => /year|month|date/i.test(h)),
    [allFields]
  );

  useEffect(() => {
    if (
      workbook &&
      headers.length > 0 &&
      (!tableName || !configNames.includes(tableName))
    ) {
      extractHeaders(workbook, sheet, headerRow, mnHeaderRow);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraFields]);

  function computeIdCandidates(hdrs, extras, map, mode) {
    const strs = hdrs.filter((h) => typeof h === 'string');
    const extraList = extras
      .filter((f) => typeof f === 'string' && f.trim() !== '')
      .map((f) => normalizeField(map[f] || f));
    if (mode === 'contains') {
      const ids = strs.filter((h) => {
        const name = map[h] || h;
        return String(name).toLowerCase().includes('id');
      });
      const base = ids.length > 0 ? ids : strs;
      return Array.from(new Set([...base, ...extraList]));
    }
    return Array.from(new Set([...strs, ...extraList]));
  }

  function uniqueRenamedFields(fields = allFields, exclude, skipId = true) {
    const seen = new Set();
    const opts = [];
    for (const f of fields) {
      if (f === exclude) continue;
      if (skipId && f === idColumn) continue;
      if (seen.has(f)) continue;
      seen.add(f);
      opts.push({ value: f, label: renameMap[f] || f });
    }
    return opts;
  }

  async function applyHeaderMapping(hdrs, currentMap) {
    try {
      const params = new URLSearchParams();
      params.set('headers', hdrs.join(','));
      const res = await fetch(`/api/header_mappings?${params.toString()}`, { credentials: 'include' });
      const fetched = res.ok ? await res.json() : {};
      const map = { ...currentMap };
      hdrs.forEach((h) => {
        if (!map[h]) {
          map[h] = fetched[h] || translateToMn(h);
        }
      });
      setHeaderMap(map);
    } catch {
      const map = { ...currentMap };
      hdrs.forEach((h) => {
        if (!map[h]) map[h] = translateToMn(h);
      });
      setHeaderMap(map);
    }
  }

  function addExtraField() {
    setExtraFields((f) => [...f, '']);
  }

  function removeExtraField(idx) {
    setExtraFields((f) => f.filter((_, i) => i !== idx));
  }

  async function loadWorkbook(file) {
    setLoadingWorkbook(true);
    setLoadProgress(0);
    try {
      const reader = new FileReader();
      const ab = await new Promise((resolve, reject) => {
        reader.onload = (ev) => {
          setLoadProgress(90);
          resolve(ev.target.result);
        };
        reader.onerror = () => reject(reader.error);
        reader.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0) {
            const pct = Math.floor((ev.loaded / ev.total) * 90);
            setLoadProgress(pct);
          }
        };
        reader.readAsArrayBuffer(file);
      });

      const worker = new Worker(
        new URL('../utils/workbookWorker.js', import.meta.url),
      );
      workerRef.current = worker;
      await new Promise((resolve) => {
        worker.onmessage = (ev) => {
          const { workbook: wb, error } = ev.data;
          workerRef.current = null;
          setLoadingWorkbook(false);
          if (error || !wb) {
            console.error('Failed to load workbook', error);
            addToast(
              error || 'Unable to read file. Please select a valid Excel file.',
              'error',
            );
            setWorkbook(null);
            setSheets([]);
            setSelectedFile(null);
            setLoadProgress(0);
          } else {
            setWorkbook(wb);
            setSheets(wb.SheetNames);
            const firstSheet = wb.SheetNames[0];
            sheetSelectedManuallyRef.current = false;
            setSheet(firstSheet);
            setLoadProgress(100);
          }
          resolve();
        };
        worker.postMessage({ arrayBuffer: ab }, [ab]);
      });
      headerRowSelectedManuallyRef.current = false;
      setHeaderRow(1);
      mnHeaderRowSelectedManuallyRef.current = false;
      setMnHeaderRow('');
      setHeaders([]);
      setHeaderMap({});
      setIdCandidates([]);
      setIdColumn('');
      setNameColumn('');
      setStructSql('');
      setStructSqlOther('');
      setRecordsSql('');
      setRecordsSqlOther('');
      setSqlMove('');
      setOtherColumns([]);
      setUniqueFields([]);
      setColumnTypes({});
      setNotNullMap({});
      setAllowZeroMap({});
      setDefaultValues({});
      setPopulateRange(false);
      setStartYear('');
      setEndYear('');
      setAutoIncStart('1');
    } catch (err) {
      console.error('Failed to load workbook', err);
      addToast(err.message || 'Unable to read file.', 'error');
      setWorkbook(null);
      setSheets([]);
      setSelectedFile(null);
      setLoadingWorkbook(false);
      setLoadProgress(0);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    }
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!/\.xlsx$|\.xls$|\.xlsb$/i.test(file.name)) {
      addToast('Unsupported file type. Please select an Excel file.', 'error');
      return;
    }
    setSelectedFile(file);
    setLoadProgress(0);
    loadWorkbook(file);
  }

  function handleSheetChange(e) {
    const s = e.target.value;
    setSheet(s);
    sheetSelectedManuallyRef.current = true;
    setHeaders([]);
    setHeaderMap({});
    setMnHeaderRow('');
    mnHeaderRowSelectedManuallyRef.current = false;
    setIdCandidates([]);
    setIdColumn('');
    setNameColumn('');
    setStructSql('');
    setStructSqlOther('');
    setRecordsSql('');
    setRecordsSqlOther('');
    setSqlMove('');
    setOtherColumns([]);
    setUniqueFields([]);
    setColumnTypes({});
    setNotNullMap({});
    setAllowZeroMap({});
    setDefaultValues({});
    setPopulateRange(false);
    setStartYear('');
    setEndYear('');
    setAutoIncStart('1');
    const entry = Object.entries(configMap).find(([, cfg]) => cfg.sheet === s);
    if (entry) {
      setTableName(entry[0]);
    } else {
      setTableName('');
      if (workbook) {
        extractHeaders(workbook, s, headerRow, mnHeaderRow);
      }
    }
  }

  function handleHeaderRowChange(e) {
    const r = Number(e.target.value) || 1;
    setHeaderRow(r);
    headerRowSelectedManuallyRef.current = true;
    setHeaders([]);
    setHeaderMap({});
    setMnHeaderRow('');
    mnHeaderRowSelectedManuallyRef.current = false;
    setIdCandidates([]);
    setIdColumn('');
    setNameColumn('');
    setStructSql('');
    setStructSqlOther('');
    setRecordsSql('');
    setRecordsSqlOther('');
    setSqlMove('');
    setOtherColumns([]);
    setUniqueFields([]);
    setColumnTypes({});
    setNotNullMap({});
    setAllowZeroMap({});
    setDefaultValues({});
    setPopulateRange(false);
    setStartYear('');
    setEndYear('');
    setAutoIncStart('1');
  }

  function handleMnHeaderRowChange(e) {
    setMnHeaderRow(e.target.value);
    mnHeaderRowSelectedManuallyRef.current = true;
  }

  function refreshFile() {
    if (!fileInputRef.current) return;
    // allow re-selecting the same file to pick up any changes
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }

  function extractHeaders(wb, s, row, mnRow) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[s], {
      header: 1,
      blankrows: false,
    });
    const idx = Number(row) - 1;
    const mnIdx = mnRow ? Number(mnRow) - 1 : -1;
    const raw = data[idx] || [];
    const mnRaw = mnIdx >= 0 ? data[mnIdx] || [] : [];
    const hdrs = [];
    const keepIdx = [];
    const map = {};
    const seen = {};
    const extras = extraFields
      .filter((f) => f.trim() !== '')
      .map((f) => normalizeField(f));
    extras.forEach((key) => {
      if (key) {
        seen[key] = (seen[key] || 0) + 1;
      }
    });
    const dup = new Set();
    raw.forEach((h, i) => {
      if (String(h).trim().length > 0) {
        const clean = cleanIdentifier(h);
        const key = normalizeField(h);
        if (key in seen) {
          const suffixNum = seen[key];
          const suffixed = `${clean}_${suffixNum}`;
          dup.add(suffixed);
          hdrs.push(suffixed);
          seen[key] = suffixNum + 1;
        } else {
          seen[key] = 1;
          hdrs.push(clean);
        }
        keepIdx.push(i);
        const mnVal = mnRaw[i];
        const hdrKey = hdrs[hdrs.length - 1];
        if (mnVal && String(mnVal).trim()) {
          map[hdrKey] = String(mnVal).trim();
        }
      }
    });
    setHeaders(hdrs);
    setHeaderMap(map);
    const rMap = {};
    hdrs.forEach((h) => {
      rMap[h] = h;
    });
    setRenameMap(rMap);
    const defFrom = {};
    hdrs.forEach((h) => {
      defFrom[h] = '';
    });
    setDefaultFrom(defFrom);
    if (!mnRow) {
      applyHeaderMapping(hdrs, map);
    }
    const rows = data.slice(idx + 1);
    const valsByHeader = {};
    hdrs.forEach((h, i) => {
      const colIdx = keepIdx[i];
      valsByHeader[h] = rows.map((r) => r[colIdx]);
    });
    const types = {};
    hdrs.forEach((h) => {
      types[h] = detectType(h, valsByHeader[h]);
    });
    setColumnTypes(types);
    const nn = {};
    hdrs.forEach((h) => {
      nn[h] = false;
    });
    setNotNullMap(nn);
    const az = {};
    hdrs.forEach((h) => {
      az[h] = true;
    });
    setAllowZeroMap(az);
    setDuplicateHeaders(dup);
    setInitialDuplicates(dup);
    if (dup.size > 0) {
      addToast('Duplicate header names detected. Please rename them.', 'warning');
    }
  }

  function handleExtract() {
    if (!workbook) return;
    extractHeaders(workbook, sheet, headerRow, mnHeaderRow);
  }

  function removeSqlUnsafeChars(v) {
    if (typeof v !== 'string') return v;
    return v.replace(/[\\/"'\[\]]/g, '');
  }

  function escapeSqlValue(v) {
    const sanitized = removeSqlUnsafeChars(v);
    return `'${String(sanitized).replace(/'/g, "''")}'`;
  }

  const excelErrorRegex = /^#(?:N\/A|VALUE!?|DIV\/0!?|REF!?|NUM!?|NAME\??|NULL!?)/i;

  function normalizeExcelError(val, type) {
    if (typeof val === 'string' && excelErrorRegex.test(val.trim())) {
      return defaultValForType(type);
    }
    return val;
  }

  function normalizeSpecialChars(val, type) {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if ((trimmed === '' && /\s+/.test(val)) || /^-+$/.test(trimmed)) {
        return defaultValForType(type);
      }
    }
    return val;
  }

  function normalizeNumeric(val, type) {
    if (!type) return val;
    const t = String(type).toUpperCase();
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER/.test(t)) {
      if (typeof val === 'string' && val.includes(',')) {
        const replaced = val.replace(/,/g, '.');
        const num = Number(replaced);
        if (!Number.isNaN(num)) return num;
        return replaced;
      }
    }
    return val;
  }

  function detectType(name, vals) {
    const lower = String(name).toLowerCase();
    if (lower.includes('_per')) return 'DECIMAL(5,2)';
    if (lower.includes('date')) return 'DATE';
    for (const v of vals) {
      let cleanV = normalizeExcelError(v);
      cleanV = normalizeSpecialChars(cleanV);
      if (cleanV === undefined || cleanV === '') continue;
      const n = Number(cleanV);
      if (!Number.isNaN(n)) {
        const str = String(cleanV);
        const digits = str.replace(/[-.]/g, '');
        if (digits.length > 8) break;
        if (str.includes('.')) return 'DECIMAL(10,2)';
        return 'INT';
      }
      break;
    }
    let maxLen = 1;
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      const len = String(v).length;
      if (len > maxLen) maxLen = len;
    }
    if (maxLen > 255) maxLen = 255;
    return `VARCHAR(${maxLen})`;
  }

  function parseExcelDate(val) {
    if (typeof val === 'number') {
      const base = new Date(Date.UTC(1899, 11, 30));
      base.setUTCDate(base.getUTCDate() + val);
      return base;
    }
    if (typeof val === 'string') {
      val = val.trim();
      if (val.includes(',')) val = val.replace(/,/g, '-');
      const m = val.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
      if (m) {
        const [, y, mo, d] = m;
        return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
      }
    }
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function parseCalcField(line) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:(.*)$/);
    if (!m) return null;
    const [, name, desc] = m;
    const lower = desc.trim().toLowerCase();
    if (lower.includes('age') && lower.includes('birth')) {
      return { name, expression: 'TIMESTAMPDIFF(YEAR, birthdate, CURDATE())' };
    }
    return { name, expression: desc.trim() };
  }

  function parseCalcFields(text) {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)
      .map(parseCalcField)
      .filter(Boolean);
  }

  function formatVal(val, type) {
    val = normalizeExcelError(val, type);
    val = normalizeSpecialChars(val, type);
    // Only convert obviously placeholder characters to 0 via
    // normalizeSpecialChars.  Blank values should remain blank so that
    // missing data can be detected correctly.
    if (val === undefined || val === null || val === '') return 'NULL';
    if (type === 'DATE') {
      const d = parseExcelDate(val);
      if (!d) return 'NULL';
      return `'${formatTimestamp(d).slice(0, 10)}'`;
    }
    val = normalizeNumeric(val, type);
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER/.test(String(type).toUpperCase())) {
      return String(val);
    }
    return escapeSqlValue(val);
  }

  function defaultValForType(type) {
    if (!type) return 0;
    const t = String(type).toUpperCase();
    if (t === 'DATE') return 0;
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER/.test(t)) {
      return 0;
    }
    return '0';
  }

  function makeUniqueKeyName(fields) {
    const base = `uniq_${fields.join('_')}`;
    if (base.length > 60) {
      let hash = 0;
      for (let i = 0; i < base.length; i++) {
        hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
      }
      return `uniq_${hash.toString(16)}`;
    }
    return base;
  }

  function parseSqlConfig(sqlText) {
    const m = sqlText.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+`([^`]+)`/i);
    if (!m) return null;
    const table = m[1];
    const start = sqlText.indexOf('(', m.index + m[0].length);
    const end = sqlText.lastIndexOf(')');
    if (start === -1 || end === -1 || end <= start) return null;
    const body = sqlText.slice(start + 1, end);
    const autoMatch = sqlText.slice(end).match(/AUTO_INCREMENT=(\d+)/i);
    const autoInc = autoMatch ? autoMatch[1] : '1';
    const lines = body
      .split(/,\s*\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const columnTypes = {};
    const notNull = {};
    const defaults = {};
    const calc = [];
    const other = [];
    let idCol = '';
    let nameCol = '';
    let uniqueLine = '';
    for (const ln of lines) {
      if (ln.trimStart().startsWith('UNIQUE KEY')) {
        uniqueLine = ln;
        continue;
      }
      const colMatch = ln.match(/^`([^`]+)`\s+(.*)$/);
      if (!colMatch) continue;
      const col = colMatch[1];
      let rest = colMatch[2];
      let type = '';
      let i = 0;
      let depth = 0;
      let quote = null;
      while (i < rest.length) {
        const ch = rest[i];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          if (depth > 0) depth--;
        } else if (depth === 0 && /\s/.test(ch)) {
          const after = rest.slice(i).trimStart();
          if (/^(UNSIGNED|NOT|NULL|DEFAULT|AUTO_INCREMENT|COMMENT|PRIMARY|UNIQUE|KEY|CHARACTER|COLLATE)/i.test(after)) {
            type = rest.slice(0, i).trim();
            rest = after;
            break;
          }
        }
        i++;
      }
      if (!type) {
        type = rest.trim();
        rest = '';
      }
      if (/AS \(/.test(rest)) {
        const cm = rest.match(/AS \(([^)]+)\)/);
        if (cm) calc.push(`${col}: ${cm[1]}`);
        continue;
      }
      columnTypes[col] = type;
      notNull[col] = /NOT NULL/.test(rest);
      const def = rest.match(/DEFAULT ([^ ]+)/);
      if (def) {
        defaults[col] = def[1].replace(/^'|'$/g, '');
      }
      if (/AUTO_INCREMENT/.test(rest) && /PRIMARY KEY/.test(rest)) {
        idCol = col;
      } else if (col === 'name') {
        nameCol = col;
      } else {
        other.push(col);
      }
    }
    const uniq = [];
    if (uniqueLine) {
      const um = uniqueLine.match(/\(([^)]+)\)/);
      if (um) {
        um[1]
          .split(',')
          .map((s) => s.trim().replace(/`/g, ''))
          .forEach((c) => uniq.push(c));
      }
    }

    const foreigns = lines.filter((l) => /^(KEY|CONSTRAINT|FOREIGN KEY)/i.test(l));

    const trigMatches = [];
    const trgRe = /CREATE\s+TRIGGER[\s\S]*?END;/gi;
    let mTrg;
    while ((mTrg = trgRe.exec(sqlText))) {
      trigMatches.push(mTrg[0].trim());
    }

    return {
      table,
      idColumn: idCol,
      nameColumn: nameCol,
      otherColumns: other.filter((c) => c !== idCol && c !== nameCol && !uniq.includes(c)),
      uniqueFields: uniq.filter((c) => c !== idCol && c !== nameCol),
      calcText: calc.join('\n'),
      columnTypes,
      notNullMap: notNull,
      allowZeroMap: Object.fromEntries(
        Object.keys(notNull).map((k) => [k, !notNull[k]])
      ),
      defaultValues: defaults,
      autoIncStart: autoInc,
      foreignKeys: foreigns.join('\n'),
      triggers: trigMatches.join('\n'),
    };
  }

  function loadFromSql() {
    const base = [structSql, foreignKeySql, triggerSql]
      .filter(Boolean)
      .join('\n');
    const cfg = parseSqlConfig(base.trim());
    if (!cfg) return;
    const hdrs = Object.keys(cfg.columnTypes || {});
    setHeaders(hdrs);
    setTableName(cfg.table);
    setIdColumn(cfg.idColumn);
    setNameColumn(cfg.nameColumn);
    setOtherColumns(cfg.otherColumns);
    setUniqueFields(cfg.uniqueFields);
    setCalcText(cfg.calcText);
    setColumnTypes((prev) => ({ ...prev, ...cfg.columnTypes }));
    setNotNullMap((prev) => ({ ...prev, ...cfg.notNullMap }));
    setAllowZeroMap((prev) => ({ ...prev, ...cfg.allowZeroMap }));
    setDefaultValues((prev) => ({ ...prev, ...cfg.defaultValues }));
    setAutoIncStart(cfg.autoIncStart || '1');
    setForeignKeySql(cfg.foreignKeys || '');
    setTriggerSql(cfg.triggers || '');
  }

  async function loadTableStructure() {
    if (!tableName) return;
    try {
      const res = await fetch(
        `/api/generated_sql/structure?table=${encodeURIComponent(tableName)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return;
      const data = await res.json();
      const allSql = data.sql || '';
      const statements = splitSqlStatements(allSql);
      setStructSql(statements[0] || '');
      setStructSqlOther('');
      setRecordsSql('');
      setRecordsSqlOther('');
      setSql(allSql);
      setSqlOther('');
      setSqlMove('');
      if (allSql) {
        const cfg = parseSqlConfig(allSql);
        if (cfg) {
          setForeignKeySql(cfg.foreignKeys || '');
          setTriggerSql(cfg.triggers || '');
        }
      }
    } catch {
      // ignore errors
    }
  }

  function generateFromWorkbook({ structure = true, records = true } = {}) {
    if (!workbook || !sheet || !tableName) return;
    const tbl = cleanIdentifier(tableName);
    const idCol = cleanIdentifier(idColumn);
    const nmCol = cleanIdentifier(nameColumn);
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      blankrows: false,
    });
    const idx = Number(headerRow) - 1;
    const raw = data[idx] || [];
    const hdrs = [];
    const keepIdx = [];
    const seen = {};
    const extrasNorm = extraFields
      .filter((f) => f.trim() !== '')
      .map((f) => normalizeField(f));
    extrasNorm.forEach((key) => {
      if (key) {
        seen[key] = (seen[key] || 0) + 1;
      }
    });
    raw.forEach((h, i) => {
      if (String(h).trim().length > 0) {
        const clean = cleanIdentifier(h);
        const key = normalizeField(h);
        if (key in seen) {
          const suffixNum = seen[key];
          hdrs.push(`${clean}_${suffixNum}`);
          seen[key] = suffixNum + 1;
        } else {
          seen[key] = 1;
          hdrs.push(clean);
        }
        keepIdx.push(i);
      }
    });
    const extra = extraFields
      .filter((f) => f.trim() !== '')
      .map((f) => cleanIdentifier(f));
    const rows = data
      .slice(idx + 1)
      .map((r) => [...keepIdx.map((ci) => r[ci]), ...Array(extra.length).fill(undefined)]);
    const allHdrs = [...hdrs, ...extra];
    const errorDescIdx = allHdrs.length;
    const dbCols = {};
    allHdrs.forEach((h) => {
      dbCols[h] = cleanIdentifier(renameMap[h] || h);
    });
    dbCols.error_description = 'error_description';

    const valuesByHeader = {};
    hdrs.forEach((h, i) => {
      valuesByHeader[h] = rows.map((r) => r[i]);
    });
    extra.forEach((h, idx2) => {
      valuesByHeader[h] = rows.map((r) => r[hdrs.length + idx2]);
    });
    const colTypes = {};
    const localNotNull = {};
    allHdrs.forEach((h) => {
      colTypes[h] = columnTypes[h] || detectType(h, valuesByHeader[h] || []);
      const defNN = (valuesByHeader[h] || []).every(
        (v) => v !== undefined && v !== null && v !== ''
      );
      localNotNull[h] =
        notNullMap[h] !== undefined ? notNullMap[h] : defNN;
    });
    colTypes.error_description = 'VARCHAR(255)';
    localNotNull.error_description = false;

    const cleanUnique = uniqueFields.map(cleanIdentifier);
    const cleanOther = otherColumns.map(cleanIdentifier);
    const uniqueOnly = cleanUnique.filter(
      (c) => c !== idCol && c !== nmCol && !cleanOther.includes(c)
    );
    const otherFiltered = cleanOther.filter(
      (c) => c !== idCol && c !== nmCol && !uniqueOnly.includes(c)
    );
    if (!idCol && !nmCol && uniqueOnly.length === 0 && otherFiltered.length === 0) {
      alert('Please select at least one ID, Name, Unique or Other column');
      return;
    }
    const idIdx = allHdrs.indexOf(idCol);
    const nameIdx = allHdrs.indexOf(nmCol);
    const hasIdValues =
      idCol && idIdx !== -1 && rows.some((r) => {
        const v = r[idIdx];
        return v !== undefined && v !== null && v !== '';
      });
    const dbIdCol = idCol ? cleanIdentifier(renameMap[idCol] || 'id') : null;
    const dbNameCol = nmCol ? cleanIdentifier(renameMap[nmCol] || 'name') : null;
    if (idCol && idIdx === -1) return;
    if (nmCol && nameIdx === -1) return;
    const uniqueIdx = uniqueOnly.map((c) => allHdrs.indexOf(c));
    const otherIdx = otherFiltered.map((c) => allHdrs.indexOf(c));
    const stateIdx = allHdrs.findIndex((h) => /state/i.test(h));

    const fieldsToCheck = [
      ...(nmCol ? [nmCol] : []),
      ...uniqueOnly,
      ...otherFiltered,
      ...extra,
    ];

    let finalRows = rows;
    if (populateRange && startYear && endYear) {
      const yearField = allHdrs.find((h) => /year/i.test(h));
      if (yearField) {
        const monthField = allHdrs.find((h) => /month/i.test(h));
        const yIdx = allHdrs.indexOf(yearField);
        const mIdx = allHdrs.indexOf(monthField);
        finalRows = [];
        for (let y = Number(startYear); y <= Number(endYear); y++) {
          const months = monthField ? Array.from({ length: 12 }, (_, i) => i + 1) : [null];
          for (const mo of months) {
            for (const r of rows) {
              const copy = [...r];
              if (yIdx !== -1) copy[yIdx] = y;
              if (mIdx !== -1 && mo !== null) copy[mIdx] = mo;
              finalRows.push(copy);
            }
          }
        }
      }
    }
    // When populating a range of records we previously filtered out rows that
    // contained disallowed values (NULL or 0 when "Allow 0" was unchecked).
    // This meant such rows were dropped completely instead of being moved to
    // the `_other` table.  By keeping all rows here and letting the later
    // `zeroInvalid` check decide where they belong, zero value records will be
    // preserved and inserted into the `_other` table as expected.

    const mainRows = [];
    const otherRows = [];
    const dupRows = [];
    const seenKeys = new Set();
    const dupList = [];

    function resolvedValue(row, idx, field) {
      let v = idx === -1 ? undefined : row[idx];
      v = normalizeExcelError(v, colTypes[field]);
      v = normalizeSpecialChars(v, colTypes[field]);
      if (v === undefined || v === null || v === '') {
        const from = defaultFrom[field];
        if (from) {
          const fi = allHdrs.indexOf(from);
          v = fi === -1 ? undefined : row[fi];
        }
        if (v === undefined || v === null || v === '') {
          v = defaultValues[field];
        }
      }
      return v;
    }
    finalRows.forEach((r) => {
      let key = '';
      if (uniqueOnly.length > 0) {
        key = uniqueOnly
          .map((c, idx2) => {
            const ui = uniqueIdx[idx2];
            return ui === -1 ? '' : r[ui];
          })
          .join('|');
      }
      const isDup = key && seenKeys.has(key);
      if (key) seenKeys.add(key);
      if (isDup) {
        const copy = [...r];
        const colNames = uniqueOnly.map((c) => renameMap[c] || c).join(', ');
        copy[errorDescIdx] = colNames ? `duplicate: ${colNames}` : 'duplicate';
        dupRows.push(copy);
        dupList.push(key);
        return;
      }
      const invalidCols = [];
      for (const f of fieldsToCheck) {
        const idxF = allHdrs.indexOf(f);
        const v = resolvedValue(r, idxF, f);
        const isZero =
          v === 0 || (typeof v === 'string' && v.trim() !== '' && Number(v) === 0);
        if (isZero && !allowZeroMap[f]) {
          invalidCols.push(renameMap[f] || f);
          continue;
        }
        if (localNotNull[f] && (v === undefined || v === null || v === '')) {
          invalidCols.push(renameMap[f] || f);
        }
      }
      const stateVal = stateIdx === -1 ? '1' : String(r[stateIdx]);
      const reasons = [];
      if (invalidCols.length > 0) {
        reasons.push(`invalid value: ${invalidCols.join(', ')}`);
      }
      if (stateVal !== '1') {
        const sCol = stateIdx === -1 ? '' : renameMap[allHdrs[stateIdx]] || allHdrs[stateIdx];
        reasons.push(sCol ? `inactive state: ${sCol}` : 'inactive state');
      }
      if (reasons.length === 0) {
        mainRows.push(r);
      } else {
        const copy = [...r];
        copy[errorDescIdx] = reasons.join('; ');
        otherRows.push(copy);
      }
    });
    setDuplicateInfo(dupList.join('\n'));
    setDuplicateRecords(dupRows.map((r) => r.join(',')).join('\n'));

    let extras = [];
    if (foreignKeySql) {
      extras = foreignKeySql
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l);
    } else if (sql) {
      const m = sql.match(/CREATE TABLE[^\(]*\([^]*?\)/m);
      if (m) {
        const body = m[0].replace(/^[^\(]*\(|\)[^\)]*$/g, '');
        const lines = body.split(/,\n/).map((l) => l.trim());
        extras = lines.filter((l) => /^(KEY|CONSTRAINT|FOREIGN KEY)/i.test(l));
      }
    }

    let defs = [];
    const seenDef = new Set();
    const addDef = (col, def) => {
      if (seenDef.has(col)) return;
      seenDef.add(col);
      defs.push(def);
    };
    if (idCol) {
      addDef(dbIdCol, `\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nmCol) {
      addDef(dbNameCol, `\`${dbNameCol}\` ${colTypes[nmCol]} NOT NULL`);
    }
    uniqueOnly.forEach((c) => {
      const dbC = dbCols[c];
      addDef(dbC, `\`${dbC}\` ${colTypes[c]} NOT NULL`);
    });
    otherFiltered.forEach((c) => {
      const dbC = dbCols[c];
      let def = `\`${dbC}\` ${colTypes[c]}`;
      if (localNotNull[c]) def += ' NOT NULL';
      addDef(dbC, def);
      });
    const calcFields = parseCalcFields(calcText);
    calcFields.forEach((cf) => {
      defs.push(`\`${cf.name}\` INT AS (${cf.expression}) STORED`);
    });
    const uniqueKeyFields = [
      ...(cleanUnique.includes(nmCol) ? [dbNameCol] : []),
      ...uniqueOnly.map((c) => dbCols[c]),
    ];
    if (uniqueKeyFields.length > 0) {
      const indexName = makeUniqueKeyName(uniqueKeyFields);
      defs.push(
        `UNIQUE KEY ${indexName} (${uniqueKeyFields
          .map((f) => `\`${f}\``)
          .join(', ')})`
      );
    }
    if (extras.length > 0) {
      defs.push(...extras.filter((l) => !/^UNIQUE KEY/i.test(l)));
    }
    const defsNoUnique = defs.filter((d) => !d.trim().startsWith('UNIQUE KEY'));

    const TRIGGER_SEP_RE = /^\s*---+\s*$/m;
    function buildTriggerScripts(text, tbl) {
      const trimmed = text.trim();
      if (!trimmed) return '';
      const chunks = trimmed
        .split(TRIGGER_SEP_RE)
        .map((c) => c.trim())
        .filter(Boolean);
      const statements = [];
      for (const chunk of chunks) {
        if (/^(CREATE|DROP)\s+TRIGGER/i.test(chunk)) {
          statements.push(...splitSqlStatements(chunk));
        } else {
          statements.push(chunk);
        }
      }
      const counts = {};
      const results = [];
      for (let i = 0; i < statements.length; i++) {
        const piece = statements[i].trim();
        if (/^(CREATE|DROP)\s+TRIGGER/i.test(piece)) {
          results.push(piece.endsWith(';') ? piece : piece + ';');
          continue;
        }
        const colMatch = piece.match(/SET\s+NEW\.\`?([A-Za-z0-9_]+)\`?\s*=/i);
        const col = colMatch ? cleanIdentifier(colMatch[1]) : `col${i + 1}`;
        counts[col] = (counts[col] || 0) + 1;
        const suffix = counts[col] > 1 ? `_bi${counts[col]}` : '_bi';
        const trgName = `${tbl}_${col}${suffix}`;

        let inner = piece;
        if (/^BEGIN/i.test(inner)) {
          inner = inner.replace(/^BEGIN/i, '').replace(/END;?$/i, '').trim();
        }

        const lines = inner.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const declareLines = [];
        while (lines.length && /^DECLARE\b/i.test(lines[0])) {
          declareLines.push(lines.shift().replace(/;?$/, ';'));
        }
        inner = lines.join('\n').trim();

        const startsWithCheck = new RegExp(`^IF\\s+NEW\\.${col}\\b`, 'i').test(inner);
        const declBlock = declareLines.length ? `  ${declareLines.join('\n  ')}\n` : '';

        if (startsWithCheck) {
          const body = `BEGIN\n${declBlock}  ${inner.replace(/;?\s*$/, ';')}\nEND;`;
          results.push(
            `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`
          );
        } else {
          inner = inner.replace(/;?\s*$/, ';');
          const body = `BEGIN\n${declBlock}  IF NEW.${col} IS NULL OR NEW.${col} = '' THEN\n    ${inner}\n  END IF;\nEND;`;
          results.push(
            `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`
          );
        }
      }
      return results
        .map((p) => (p.trim().endsWith(';') ? p.trim() : `${p.trim()};`))
        .join('\n');
    }

    function buildOtherStructure(tableNameForSql) {
      const defArr = defsNoUnique
        .filter((d) => !/^(KEY|CONSTRAINT|FOREIGN KEY)/i.test(d))
        .map((d) => (/AUTO_INCREMENT/i.test(d) ? d : d.replace(/\s+NOT NULL\b/gi, '')));
      defArr.push('`error_description` VARCHAR(255)');
      return `CREATE TABLE IF NOT EXISTS \`${tableNameForSql}\` (\n  ${defArr.join(',\n  ')}\n);`;
    }

    function buildStructure(
      tableNameForSql,
      useUnique = true,
      includeError = false
    ) {
      const defArr = [...(useUnique ? defs : defsNoUnique)];
      if (includeError) defArr.push('`error_description` VARCHAR(255)');
      const base = `CREATE TABLE IF NOT EXISTS \`${tableNameForSql}\` (\n  ${defArr.join(',\n  ')}\n)${idCol ? ` AUTO_INCREMENT=${autoIncStart}` : ''};`;

      const trgSql = buildTriggerScripts(triggerSql, tableNameForSql);
      const trgPart = trgSql ? `\n${trgSql}` : '';
      return `${base}${trgPart}\n`;
    }

    function buildInsert(rows, tableNameForSql, fields, chunkLimit = 100, relaxed = false) {
      if (!rows.length || !fields.length) return '';
      const cols = fields.map((f) => `\`${dbCols[f] || cleanIdentifier(renameMap[f] || f)}\``);
      const idxMap = fields.map((f) => allHdrs.indexOf(f));
      const updates = cols.map((c) => `${c} = VALUES(${c})`);
      const parts = [];
      let chunkValues = [];
      for (const r of rows) {
        let hasData = relaxed;
        const vals = idxMap.map((idx, i) => {
          const f = fields[i];
          let v;
          if (idx === -1) {
            v = f === 'error_description' ? r[errorDescIdx] : undefined;
          } else {
            v = r[idx];
          }
          v = normalizeExcelError(v, colTypes[f]);
          v = normalizeSpecialChars(v, colTypes[f]);
          if (v === undefined || v === null || v === '') {
            const from = defaultFrom[f];
            if (from) {
              const fi = allHdrs.indexOf(from);
              v = fi === -1 ? undefined : r[fi];
            }
            if (v === undefined || v === null || v === '') {
              v = defaultValues[f];
            }
          }
          if (!relaxed) {
            if (
              v !== undefined &&
              v !== null &&
              v !== '' &&
              (allowZeroMap[f] ? true : v !== 0)
            ) {
              hasData = true;
            }
            if (localNotNull[f]) {
              hasData = true;
            }
          }
          return formatVal(v, colTypes[f]);
        });
        if (!hasData) continue;
        chunkValues.push(`(${vals.join(', ')})`);
        if (chunkValues.length >= chunkLimit) {
          parts.push(`INSERT INTO \`${tableNameForSql}\` (${cols.join(', ')}) VALUES ${chunkValues.join(', ')} ON DUPLICATE KEY UPDATE ${updates.join(', ')};`);
          chunkValues = [];
        }
      }
      if (chunkValues.length > 0) {
        parts.push(`INSERT INTO \`${tableNameForSql}\` (${cols.join(', ')}) VALUES ${chunkValues.join(', ')} ON DUPLICATE KEY UPDATE ${updates.join(', ')};`);
      }
      return parts.join('\n');
    }

    function buildGroupedInsertSQL(
      allRows,
      tableNameForSql,
      fields,
      groupByFn,
      chunkLimit = 100,
      relaxed = false
    ) {
      let groups = [];
      if (typeof groupByFn === 'function') {
        const grouped = {};
        for (const row of allRows) {
          const key = String(groupByFn(row) ?? '');
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(row);
        }
        groups = Object.entries(grouped).map(([k, v]) => ({ key: k, rows: v }));
      } else {
        groups = [{ key: '', rows: allRows }];
      }

      const totalChunks = groups.reduce(
        (sum, g) => sum + Math.ceil(g.rows.length / chunkLimit),
        0
      );

      const parts = [];
      let chunkIndex = 0;
      for (const { key, rows } of groups) {
        for (let i = 0; i < rows.length; i += chunkLimit) {
          const chunkRows = rows.slice(i, i + chunkLimit);
          chunkIndex++;
          const keySuffix = key ? ` (${key})` : '';
          parts.push(
            `-- Progress: Group ${chunkIndex} of ${totalChunks}${keySuffix}`
          );
          parts.push(
            buildInsert(chunkRows, tableNameForSql, fields, chunkLimit, relaxed)
          );
        }
      }
      return parts.filter(Boolean).join('\n');
    }

    let fields = [
      ...(nmCol ? [nmCol] : []),
      ...uniqueOnly,
      ...otherFiltered,
      ...extra,
    ];
    const seenCols = new Set();
    fields = fields.filter((f) => {
      const db = dbCols[f] || cleanIdentifier(renameMap[f] || f);
      if (seenCols.has(db)) return false;
      seenCols.add(db);
      return true;
    });
    const mainFieldDefs = fields.map((f) => ({
      source: f,
      column: dbCols[f] || cleanIdentifier(renameMap[f] || f),
      type: colTypes[f],
    }));

    const structMainStr = buildStructure(tbl, true);
    const insertMainStr = buildGroupedInsertSQL(
      mainRows,
      tbl,
      fields,
      null,
      parseInt(groupSize, 10) || 300,
      false
    );
    const otherCombined = [...otherRows, ...dupRows];
    const structOtherStr = buildOtherStructure(`${tbl}_other`);
    const fieldsWithoutId = fields.filter((f) => f !== idCol);
    const fieldsOther = [...fieldsWithoutId, 'error_description'];
    const otherFieldDefs = fieldsOther.map((f) => ({
      source: f,
      column:
        f === 'error_description'
          ? 'error_description'
          : dbCols[f] || cleanIdentifier(renameMap[f] || f),
      type: f === 'error_description' ? 'VARCHAR(255)' : colTypes[f],
    }));

    function convertRowToRecord(row, fieldDefs, relaxed = false) {
      const record = {};
      let hasData = relaxed;
      fieldDefs.forEach(({ source, column, type }) => {
        const sourceIdx =
          source === 'error_description' ? errorDescIdx : allHdrs.indexOf(source);
        let value = sourceIdx === -1 ? undefined : row[sourceIdx];
        if (source === 'error_description') {
          value = row[errorDescIdx];
        }
        value = normalizeExcelError(value, type);
        value = normalizeSpecialChars(value, type);
        if (
          (value === undefined || value === null || value === '') &&
          source !== 'error_description'
        ) {
          const from = defaultFrom[source];
          if (from) {
            const fi = allHdrs.indexOf(from);
            if (fi !== -1) {
              value = row[fi];
              value = normalizeExcelError(value, type);
              value = normalizeSpecialChars(value, type);
            }
          }
          if (value === undefined || value === null || value === '') {
            value = defaultValues[source];
          }
        }
        value = normalizeNumeric(value, type);
        const typeUpper = typeof type === 'string' ? type.toUpperCase() : '';
        let finalVal = value;
        if (finalVal === undefined || finalVal === null || finalVal === '') {
          record[column] = null;
        } else if (typeUpper === 'DATE') {
          const parsed = parseExcelDate(finalVal);
          record[column] = parsed ? formatTimestamp(parsed).slice(0, 10) : null;
        } else if (/DATETIME|TIMESTAMP/.test(typeUpper)) {
          const parsed =
            finalVal instanceof Date ? finalVal : parseExcelDate(finalVal);
          record[column] = parsed ? formatTimestamp(parsed) : null;
        } else if (/(INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER)/.test(typeUpper)) {
          const num = Number(finalVal);
          record[column] = Number.isNaN(num) ? null : num;
        } else {
          record[column] = finalVal;
        }
        const currentVal = record[column];
        if (!relaxed) {
          if (
            currentVal !== null &&
            currentVal !== '' &&
            currentVal !== undefined &&
            (allowZeroMap[source] ? true : currentVal !== 0)
          ) {
            hasData = true;
          }
          if (localNotNull[source]) {
            hasData = true;
          }
        } else if (
          currentVal !== null &&
          currentVal !== '' &&
          currentVal !== undefined
        ) {
          hasData = true;
        }
      });
      if (!hasData) return null;
      return record;
    }

    const insertOtherStr = buildGroupedInsertSQL(
      otherCombined,
      `${tbl}_other`,
      fieldsOther,
      null,
      parseInt(groupSize, 10) || 300,
      true
    );
    if (structure) {
      const sqlStr = structMainStr + insertMainStr;
      const sqlOtherStr =
        otherCombined.length > 0 ? structOtherStr + insertOtherStr : '';
      setStructSql(structMainStr);
      setStructSqlOther(structOtherStr);
      setSql(sqlStr);
      setSqlOther(sqlOtherStr);
      setSqlMove('');
      fetch('/api/generated_sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table: tbl, sql: sqlStr }),
      }).catch(() => {});
      if (sqlOtherStr) {
        fetch('/api/generated_sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ table: `${tbl}_other`, sql: sqlOtherStr }),
        }).catch(() => {});
      }
    }
    if (records) {
      setRecordsSql(insertMainStr);
      setRecordsSqlOther(insertOtherStr);
      const preparedMain = mainRows
        .map((row) => convertRowToRecord(row, mainFieldDefs, false))
        .filter(Boolean);
      const preparedOther = otherCombined
        .map((row) => convertRowToRecord(row, otherFieldDefs, true))
        .filter(Boolean);
      setPreparedMainRows(preparedMain);
      setPreparedOtherRows(preparedOther);
      setPreparedMainFieldTypes(
        Object.fromEntries(
          mainFieldDefs.map((def) => [def.column, def.type || null]),
        ),
      );
      setPreparedOtherFieldTypes(
        Object.fromEntries(
          otherFieldDefs.map((def) => [def.column, def.type || null]),
        ),
      );
    } else {
      setPreparedMainRows([]);
      setPreparedOtherRows([]);
      setPreparedMainFieldTypes({});
      setPreparedOtherFieldTypes({});
    }
    const errCounts = {};
    otherRows.forEach((r) => {
      const desc = r[errorDescIdx] || 'unknown';
      errCounts[desc] = (errCounts[desc] || 0) + 1;
    });
    const errSummary = Object.entries(errCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    setMainCount(mainRows.length);
    setOtherCount(otherRows.length);
    setDupCount(dupRows.length);
    setErrorGroups(errCounts);
    setSummaryInfo(
      `Processed ${finalRows.length} records. Main: ${mainRows.length}. Duplicates: ${dupRows.length}. Other: ${otherRows.length}. ${errSummary}`
    );
  }

  function handleGenerateSql() {
    if (duplicateHeaders.size > 0) {
      alert('Please rename duplicate fields first');
      return;
    }
    setStructSql('');
    setStructSqlOther('');
    setRecordsSql('');
    setRecordsSqlOther('');
    setInsertedMain(0);
    setInsertedOther(0);
    setUnsuccessfulGroups({});
    setPreparedMainRows([]);
    setPreparedOtherRows([]);
    setPreparedMainFieldTypes({});
    setPreparedOtherFieldTypes({});
    generateFromWorkbook({ structure: true, records: true });
  }

  function handleGenerateRecords() {
    if (duplicateHeaders.size > 0) {
      alert('Please rename duplicate fields first');
      return;
    }
    setRecordsSql('');
    setRecordsSqlOther('');
    setInsertedMain(0);
    setInsertedOther(0);
    setUnsuccessfulGroups({});
    setPreparedMainRows([]);
    setPreparedOtherRows([]);
    setPreparedMainFieldTypes({});
    setPreparedOtherFieldTypes({});
    generateFromWorkbook({ structure: false, records: true });
  }

  function splitSqlStatements(sqlText) {
    const lines = sqlText.split(/\r?\n/);
    const statements = [];
    let current = [];
    let inTrigger = false;
    for (const line of lines) {
      current.push(line);
      if (inTrigger) {
        if (/END;\s*$/.test(line)) {
          statements.push(current.join('\n').trim());
          current = [];
          inTrigger = false;
        }
      } else if (/^CREATE\s+TRIGGER/i.test(line)) {
        inTrigger = true;
      } else if (/;\s*$/.test(line)) {
        statements.push(current.join('\n').trim());
        current = [];
      }
    }
    if (current.length) {
      const stmt = current.join('\n').trim();
      if (stmt) statements.push(stmt.endsWith(';') ? stmt : stmt + ';');
    }
    return statements;
  }

  function countSqlRows(sqlText) {
    const statements = splitSqlStatements(sqlText);
    let total = 0;
    for (const stmt of statements) {
      const valMatch = stmt.match(/VALUES\s+(.+?)(?:ON DUPLICATE|;)/is);
      if (valMatch) {
        total += valMatch[1].split(/\),\s*\(/).length;
      }
    }
    return total;
  }

  async function runStatements(statements) {
    setUploadProgress({ done: 0, total: statements.length });
    setInsertedCount(0);
    setGroupMessage(
      statements.length > 0 ? `Statement 1/${statements.length}` : ''
    );
    let totalInserted = 0;
    let mainInserted = 0;
    let otherInserted = 0;
    const errGroups = {};
    const failedAll = [];
    let errorMessage = '';
    const setErrorMessage = (msg) => {
      if (typeof msg === 'string') {
        const trimmed = msg.trim();
        if (trimmed && !errorMessage) {
          errorMessage = trimmed;
        }
      }
    };
    const captureErrorDetails = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const parts = [];
      if (typeof payload.message === 'string' && payload.message.trim()) {
        parts.push(payload.message.trim());
      }
      if (Array.isArray(payload.failed) && payload.failed.length > 0) {
        const firstFailedObj = payload.failed.find(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof item.error === 'string' &&
            item.error.trim()
        );
        if (firstFailedObj) {
          parts.push(firstFailedObj.error.trim());
        } else {
          const firstFailedStr = payload.failed.find(
            (item) => typeof item === 'string' && item.trim()
          );
          if (firstFailedStr) {
            parts.push(firstFailedStr.trim());
          }
        }
      }
      if (parts.length > 0) {
        setErrorMessage(parts.join(': '));
      }
    };
    interruptRef.current = false;
    abortCtrlRef.current = new AbortController();
    for (let i = 0; i < statements.length; i++) {
      if (interruptRef.current) break;
      let stmt = statements[i];
      const progressMatch = stmt.match(/^--\s*Progress:\s*(.*)\n/);
      if (progressMatch) {
        setGroupMessage(progressMatch[1]);
        stmt = stmt.slice(progressMatch[0].length).trim();
        if (!stmt) {
          setUploadProgress({ done: i + 1, total: statements.length });
          continue;
        }
      }
      const valMatch = stmt.match(/VALUES\s+(.+?)(?:ON DUPLICATE|;)/is);
      let rowCount = 0;
      if (valMatch) {
        rowCount = valMatch[1].split(/\),\s*\(/).length;
      }
      const tblMatch = stmt.match(/INSERT\s+INTO\s+`([^`]+)`/i);
      const targetTable = tblMatch ? tblMatch[1] : '';
      const isOtherTable = /_other$/i.test(targetTable);
      if (!progressMatch) {
        setGroupMessage(
          rowCount > 0
            ? `Group ${i + 1}/${statements.length} (${rowCount} records)`
            : `Statement ${i + 1}/${statements.length}`
        );
      }
      let res;
      try {
        res = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: stmt }),
          credentials: 'include',
          signal: abortCtrlRef.current.signal,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          abortCtrlRef.current = null;
          return {
            inserted: totalInserted,
            failed: failedAll,
            aborted: true,
            errorMessage,
          };
        }
        setErrorMessage(err?.message || 'Execution failed');
        alert('Execution failed');
        abortCtrlRef.current = null;
        return {
          inserted: totalInserted,
          failed: failedAll,
          aborted: true,
          errorMessage,
        };
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        captureErrorDetails(data);
        if (!errorMessage) {
          setErrorMessage(
            (data && typeof data.message === 'string' && data.message) ||
              res.statusText ||
              'Execution failed'
          );
        }
        alert(data.message || 'Execution failed');
        abortCtrlRef.current = null;
        return {
          inserted: totalInserted,
          failed: failedAll,
          aborted: true,
          errorMessage,
        };
      }
      const data = await res.json().catch(() => ({}));
      captureErrorDetails(data);
      if (data.aborted) {
        abortCtrlRef.current = null;
        return {
          inserted: totalInserted,
          failed: failedAll,
          aborted: true,
          errorMessage,
        };
      }
      const inserted = data.inserted || 0;
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        const errMsg = data.failed
          .map((f) => (typeof f === 'string' ? f : f.error))
          .join('; ');
        errGroups[errMsg] = (errGroups[errMsg] || 0) + rowCount;
        failedAll.push(
          ...data.failed.map((f) =>
            typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
          )
        );
      } else {
        if (isOtherTable) {
          otherInserted += inserted;
        } else {
          mainInserted += inserted;
        }
      }
      totalInserted += inserted;
      setInsertedCount(totalInserted);
      addToast(`Inserted ${totalInserted} records`, 'info');
      setUploadProgress({ done: i + 1, total: statements.length });
      if (i < statements.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    setGroupMessage('');
    abortCtrlRef.current = null;
    return {
      inserted: totalInserted,
      failed: failedAll,
      aborted: interruptRef.current,
      insertedMain: mainInserted,
      insertedOther: otherInserted,
      errorGroups: errGroups,
      errorMessage,
    };
  }


  async function executeGeneratedSql() {
    const combined = [sql, sqlOther].filter(Boolean).join('\n');
    if (!combined) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const statements = splitSqlStatements(combined);
      let {
        inserted,
        failed,
        aborted,
        insertedMain: mInserted,
        insertedOther: oInserted,
        errorGroups: runErr,
        errorMessage,
      } = await runStatements(statements);
      if (aborted) {
        if (errorMessage) {
          addToast(errorMessage, 'error');
        } else {
          addToast('Insert interrupted', 'warning');
        }
      } else {
        if (failed.length > 0) {
          setSqlMove(failed.join('\n'));
        }
        setInsertedMain(mInserted);
        setInsertedOther(oInserted);
        setUnsuccessfulGroups(runErr);
        const errSummary = Object.entries(runErr)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        setSummaryInfo(
          `Inserted to main: ${mInserted}. _other: ${oInserted}. Duplicates: ${dupCount}. ${errSummary}`
        );
        if (errorMessage) {
          addToast(errorMessage, 'error');
        }
        addToast(`Table created with ${inserted} rows`, 'success');
      }
    } catch (err) {
      console.error('SQL execution failed', err);
      alert('Execution failed');
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  }

  async function executeSeparateSql() {
    const combined = [structSql, structSqlOther, recordsSql, recordsSqlOther]
      .filter(Boolean)
      .join('\n');
    if (!combined) {
      alert('No SQL to execute');
      return;
    }
    setUploading(true);
    try {
      const statements = splitSqlStatements(combined);
      let {
        inserted,
        failed,
        aborted,
        insertedMain: mInserted,
        insertedOther: oInserted,
        errorGroups: runErr,
        errorMessage,
      } = await runStatements(statements);
      if (aborted) {
        if (errorMessage) {
          addToast(errorMessage, 'error');
        } else {
          addToast('Insert interrupted', 'warning');
        }
      } else {
        if (failed.length > 0) {
          setSqlMove(failed.join('\n'));
        }
        setInsertedMain(mInserted);
        setInsertedOther(oInserted);
        setUnsuccessfulGroups(runErr);
        const errSummary = Object.entries(runErr)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        setSummaryInfo(
          `Inserted to main: ${mInserted}. _other: ${oInserted}. Duplicates: ${dupCount}. ${errSummary}`
        );
        if (errorMessage) {
          addToast(errorMessage, 'error');
        }
        addToast(`Table created with ${inserted} rows`, 'success');
      }
    } catch (err) {
      console.error('SQL execution failed', err);
      alert('Execution failed');
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  }

  async function executeOtherSql() {
    if (!structSqlOther) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const {
        inserted,
        insertedMain: mInserted,
        insertedOther: oInserted,
        errorGroups: runErr,
        aborted,
        errorMessage,
      } = await runStatements([structSqlOther]);
      if (aborted) {
        if (errorMessage) {
          addToast(errorMessage, 'error');
        } else {
          addToast('Insert interrupted', 'warning');
        }
      } else {
        if (errorMessage) {
          addToast(errorMessage, 'error');
        }
        addToast(`Other table inserted ${inserted} rows`, 'success');
        setInsertedMain(mInserted);
        setInsertedOther(oInserted);
        setUnsuccessfulGroups(runErr);
        const errSummary = Object.entries(runErr)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        setSummaryInfo(
          `Inserted to main: ${mInserted}. _other: ${oInserted}. Duplicates: ${dupCount}. ${errSummary}`
        );
      }
    } catch (err) {
      console.error('SQL execution failed', err);
      alert('Execution failed');
    } finally {
      setUploading(false);
    }
  }

  function hasValue(val) {
    return !(val === undefined || val === null || val === '');
  }

  function castDynamicValueForType(value, type) {
    if (!type) return value;
    const upper = String(type).toUpperCase();
    if (upper === 'DATE') {
      const dateVal = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(dateVal.getTime())) return null;
      return formatTimestamp(dateVal).slice(0, 10);
    }
    if (/DATETIME|TIMESTAMP/.test(upper)) {
      const dateVal = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(dateVal.getTime())) return null;
      return formatTimestamp(dateVal);
    }
    if (/(INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|LONG|BIGINT|NUMBER)/.test(upper)) {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }
    return value;
  }

  function generateOrNumber(prefix, counter) {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}${String(now.getDate()).padStart(2, '0')}`;
    return `${prefix}-${datePart}-${String(counter).padStart(5, '0')}`;
  }

  function buildLowerKeyMap(record) {
    const map = {};
    Object.keys(record || {}).forEach((key) => {
      map[key.toLowerCase()] = key;
    });
    return map;
  }

  function findKey(lowerMap, candidates) {
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (lowerMap[lower]) return lowerMap[lower];
    }
    return null;
  }

  function applyTotals(record, lowerKeyMap, fieldTypes) {
    const totalKey = findKey(lowerKeyMap, [
      'total',
      'total_amount',
      'amount_total',
      'grand_total',
      'overall_total',
      'line_total',
    ]);
    if (!totalKey) return;
    if (hasValue(record[totalKey])) return;
    const qtyKey = findKey(lowerKeyMap, ['quantity', 'qty']);
    const priceKey = findKey(lowerKeyMap, ['unit_price', 'unitprice', 'price']);
    if (qtyKey && priceKey) {
      const qty = Number(record[qtyKey]);
      const price = Number(record[priceKey]);
      if (!Number.isNaN(qty) && !Number.isNaN(price)) {
        const computed = qty * price;
        record[totalKey] = castDynamicValueForType(
          computed,
          fieldTypes[totalKey],
        );
        return;
      }
    }
    let sum = 0;
    let counted = 0;
    Object.entries(record).forEach(([key, val]) => {
      const lower = key.toLowerCase();
      if (lower === totalKey.toLowerCase()) return;
      if (!/(amount|fee|tax|subtotal|charge)/.test(lower)) return;
      const num = Number(val);
      if (Number.isNaN(num)) return;
      sum += num;
      counted += 1;
    });
    if (counted > 0) {
      record[totalKey] = castDynamicValueForType(sum, fieldTypes[totalKey]);
    }
  }

  function applyDynamicFieldValues(records, fieldTypes, options = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      return { rows: [], nextCounter: Number(options.startCounter ?? 1) };
    }
    const now = new Date();
    const orPrefix = options.orPrefix || 'OR';
    let counter = Number(options.startCounter ?? 1);
    const processed = records.map((original) => {
      const record = { ...original };
      const lowerKeyMap = buildLowerKeyMap(record);
      const createdKey = findKey(lowerKeyMap, [
        'created_at',
        'createdat',
        'created_on',
        'createdon',
      ]);
      if (createdKey && !hasValue(record[createdKey])) {
        record[createdKey] = castDynamicValueForType(
          now,
          fieldTypes[createdKey],
        );
      }
      const updatedKey = findKey(lowerKeyMap, [
        'updated_at',
        'updatedat',
        'updated_on',
        'updatedon',
      ]);
      if (updatedKey) {
        record[updatedKey] = castDynamicValueForType(
          now,
          fieldTypes[updatedKey],
        );
      }
      const orKey = findKey(lowerKeyMap, [
        'or_number',
        'ornumber',
        'or_no',
        'orno',
      ]);
      if (orKey && !hasValue(record[orKey])) {
        record[orKey] = castDynamicValueForType(
          generateOrNumber(orPrefix, counter),
          fieldTypes[orKey],
        );
        counter += 1;
      }
      applyTotals(record, lowerKeyMap, fieldTypes);
      return record;
    });
    return { rows: processed, nextCounter: counter };
  }

  async function executeRecordsSql() {
    const tbl = cleanIdentifier(tableName);
    if (!tbl) {
      addToast('Table name required', 'error');
      return;
    }
    if (preparedMainRows.length === 0 && preparedOtherRows.length === 0) {
      alert('Populate records first');
      return;
    }
    interruptRef.current = false;
    const totalRows = preparedMainRows.length + preparedOtherRows.length;
    setUploading(true);
    setSqlMove('');
    setGroupMessage(totalRows ? `Preparing ${totalRows} rows` : 'Preparing rows');
    setUploadProgress({ done: 0, total: totalRows || 1 });
    try {
      const prefixBase = tbl.slice(0, 3).toUpperCase() || 'OR';
      const mainResult = applyDynamicFieldValues(
        preparedMainRows,
        preparedMainFieldTypes,
        {
          orPrefix: prefixBase,
          startCounter: Number(autoIncStart) || 1,
        },
      );
      const otherResult = applyDynamicFieldValues(
        preparedOtherRows,
        preparedOtherFieldTypes,
        {
          orPrefix: prefixBase,
          startCounter: mainResult.nextCounter,
        },
      );
      const preparedMain = mainResult.rows;
      const preparedOther = otherResult.rows;

      setGroupMessage('Inserting rows...');
      const controller = new AbortController();
      abortCtrlRef.current = controller;
      const res = await fetch('/api/coding_tables/insertRecords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          table: tbl,
          mainRows: preparedMain,
          otherRows: preparedOther,
          useStaging: useStagingInsert,
        }),
      });
      abortCtrlRef.current = null;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to insert records');
      }
      const payload = await res.json().catch(() => ({}));
      const insertedMainCount = Number(payload.insertedMain) || 0;
      const insertedOtherCount = Number(payload.insertedOther) || 0;
      const errors = Array.isArray(payload.errors) ? payload.errors : [];
      const aborted = Boolean(payload.aborted);
      const stagingUsed = Boolean(payload.stagingUsed);

      setInsertedMain(insertedMainCount);
      setInsertedOther(insertedOtherCount);
      setInsertedCount(insertedMainCount + insertedOtherCount);
      setUploadProgress({ done: totalRows, total: totalRows || 1 });
      setGroupMessage('');

      const errorSummaryMap = errors.reduce((acc, err) => {
        const key = err && err.table ? String(err.table) : 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      setUnsuccessfulGroups(errorSummaryMap);

      const errSummaryString = Object.entries(errorSummaryMap)
        .map(([key, count]) => `${key}: ${count}`)
        .join('; ');
      const totalInsertedCount = insertedMainCount + insertedOtherCount;
      const baseSummary = [
        `Inserted to main: ${insertedMainCount}.`,
        `_other: ${insertedOtherCount}.`,
        `Total: ${totalInsertedCount}.`,
        `Duplicates: ${dupCount}.`,
      ].join(' ');
      const errorSuffix = errSummaryString ? ` Errors: ${errSummaryString}` : '';
      const combinedSummary = `${baseSummary}${errorSuffix}`;
      setSummaryInfo(combinedSummary);

      let toastSeverity = 'success';
      let statusMessage = 'Insert completed successfully.';
      if (errors.length > 0) {
        toastSeverity = 'error';
        statusMessage = aborted
          ? `Insert interrupted with row errors after ${totalInsertedCount} rows processed.`
          : 'Row insert errors encountered.';
      } else if (aborted) {
        toastSeverity = 'warning';
        statusMessage = `Insert interrupted after ${totalInsertedCount} rows processed.`;
      }
      addToast(`${statusMessage} ${combinedSummary}`.trim(), toastSeverity);
      if (payload.message) {
        addToast(payload.message, 'info');
      }
      if (stagingUsed) {
        addToast('Rows were migrated via staging table', 'info');
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        addToast('Insert interrupted', 'warning');
      } else {
        console.error('Record insertion failed', err);
        addToast(err?.message || 'Insert failed', 'error');
      }
    } finally {
      abortCtrlRef.current = null;
      setUploading(false);
      setGroupMessage('');
      setUploadProgress({ done: 0, total: 0 });
    }
  }

  async function saveMappings() {
    try {
      const finalMap = {};
      Object.entries(headerMap).forEach(([orig, val]) => {
        const key = cleanIdentifier(renameMap[orig] || orig);
        if (val) finalMap[key] = val;
      });
      await fetch('/api/header_mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mappings: finalMap }),
      });
      alert('Mappings saved');
    } catch {
      alert('Failed to save mappings');
    }
  }

  function validateConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      return 'Config is not an object';
    }
    if (cfg.columnTypes && typeof cfg.columnTypes !== 'object') {
      return 'columnTypes must be an object';
    }
    if (cfg.columnTypes) {
      for (const [k, v] of Object.entries(cfg.columnTypes)) {
        if (typeof v !== 'string') return `Type for ${k} must be string`;
        if (!/^[A-Za-z0-9_(), ]*$/.test(v))
          return `Invalid type for ${k}`;
      }
    }
    if (cfg.notNullMap && typeof cfg.notNullMap !== 'object') {
      return 'notNullMap must be an object';
    }
    if (cfg.notNullMap) {
      for (const [k, v] of Object.entries(cfg.notNullMap)) {
        if (typeof v !== 'boolean') return `${k} notNull must be true/false`;
      }
    }
    if (cfg.allowZeroMap && typeof cfg.allowZeroMap !== 'object') {
      return 'allowZeroMap must be an object';
    }
    if (cfg.allowZeroMap) {
      for (const [k, v] of Object.entries(cfg.allowZeroMap)) {
        if (typeof v !== 'boolean') return `${k} allowZero must be true/false`;
      }
    }
    if (cfg.triggers && typeof cfg.triggers !== 'string') {
      return 'triggers must be a string';
    }
    if (cfg.foreignKeys && typeof cfg.foreignKeys !== 'string') {
      return 'foreignKeys must be a string';
    }
    return null;
  }

  async function saveConfig() {
    if (!tableName) {
      addToast('Table name required', 'error');
      return;
    }
    const usedFields = new Set([
      ...headers,
      ...extraFields.filter((f) => f.trim() !== ''),
    ]);
    const filterMap = (obj) =>
      Object.fromEntries(
        Object.entries(obj || {}).filter(([k]) => usedFields.has(k))
      );
    const config = {
      sheet,
      headerRow,
      mnHeaderRow,
      idFilterMode,
      idColumn,
      nameColumn,
      otherColumns,
      uniqueFields,
      calcText,
      columnTypes: filterMap(columnTypes),
      notNullMap: filterMap(notNullMap),
      allowZeroMap: filterMap(allowZeroMap),
      defaultValues: filterMap(defaultValues),
      defaultFrom: filterMap(defaultFrom),
      renameMap: filterMap(renameMap),
      extraFields: extraFields.filter((f) => f.trim() !== ''),
      populateRange,
      startYear,
      endYear,
      autoIncStart,
      triggers: triggerSql,
      foreignKeys: foreignKeySql,
    };
    const validationError = validateConfig(config);
    if (validationError) {
      addToast(validationError, 'error');
      return;
    }
    try {
      const res = await fetch('/api/coding_table_configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ table: tableName, config }),
      });
      if (!res.ok) {
        const status = res.status;
        let text = '';
        try {
          text = await res.text();
        } catch {}
        console.error('Failed to save config', status, text);
        addToast('Failed to save config. Please check API availability.', 'error');
        return;
      }
      if (sql) {
        let struct = '';
        const m = sql.match(/CREATE TABLE[^;]+;/i);
        if (m) struct = m[0];
        else struct = splitSqlStatements(sql)[0];
        if (struct.length > 5_000_000) {
          struct = struct.slice(0, 5_000_000);
          addToast('SQL too large, truncated structure', 'info');
        }
        const resSql = await fetch('/api/generated_sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ table: tableName, sql: struct }),
        });
        if (!resSql.ok) {
          const msg = await resSql.text().catch(() => resSql.statusText);
          addToast(`Failed to save SQL: ${msg}`, 'error');
        }
      }
      addToast('Config saved', 'success');
      if (!configNames.includes(tableName))
        setConfigNames((n) => [...n, tableName]);
    } catch (err) {
      console.error('Save config failed', err);
      addToast('Failed to save config', 'error');
    }
  }

  async function deleteConfig() {
    if (!tableName) return;
    if (!window.confirm('Delete configuration?')) return;
    try {
      await fetch(`/api/coding_table_configs?table=${encodeURIComponent(tableName)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setConfigNames((n) => n.filter((x) => x !== tableName));
      setTableName('');
      addToast('Config deleted', 'success');
    } catch (err) {
      console.error('Delete config failed', err);
      addToast('Failed to delete config', 'error');
    }
  }

  useEffect(() => {
    setIdCandidates(
      computeIdCandidates(allFields, extraFields, renameMap, idFilterMode)
    );
    setUniqueFields((u) => u.filter((f) => allFields.includes(f)));
    setOtherColumns((o) => o.filter((f) => allFields.includes(f)));

    setNotNullMap((m) => {
      const updated = {};
      allFields.forEach((h) => {
        updated[h] = h in m ? m[h] : false;
      });
      const same =
        Object.keys(m).length === Object.keys(updated).length &&
        Object.keys(updated).every((k) => m[k] === updated[k]);
      return same ? m : updated;
    });

    setAllowZeroMap((m) => {
      const updated = {};
      allFields.forEach((h) => {
        updated[h] = h in m ? m[h] : !notNullMap[h];
      });
      const same =
        Object.keys(m).length === Object.keys(updated).length &&
        Object.keys(updated).every((k) => m[k] === updated[k]);
      return same ? m : updated;
    });

    setDefaultValues((d) => {
      const updated = {};
      allFields.forEach((h) => {
        updated[h] = h in d ? d[h] : '';
      });
      const same =
        Object.keys(d).length === Object.keys(updated).length &&
        Object.keys(updated).every((k) => d[k] === updated[k]);
      return same ? d : updated;
    });

    setDefaultFrom((d) => {
      const updated = {};
      allFields.forEach((h) => {
        updated[h] = h in d ? d[h] : '';
      });
      const same =
        Object.keys(d).length === Object.keys(updated).length &&
        Object.keys(updated).every((k) => d[k] === updated[k]);
      return same ? d : updated;
    });

    setRenameMap((m) => {
      const updated = {};
      allFields.forEach((h) => {
        updated[h] = h in m ? m[h] : h;
      });
      const same =
        Object.keys(m).length === Object.keys(updated).length &&
        Object.keys(updated).every((k) => m[k] === updated[k]);
      return same ? m : updated;
    });

    if (idColumn && !allFields.includes(idColumn)) setIdColumn('');
    if (nameColumn && !allFields.includes(nameColumn)) setNameColumn('');
  }, [allFields, idFilterMode, notNullMap, renameMap]);

  useEffect(() => {
    if (!tableName) return;
    if (!configNames.includes(tableName)) {
      if (workbook && sheet) {
        extractHeaders(workbook, sheet, headerRow, mnHeaderRow);
      }
      setForeignKeySql('');
      setTriggerSql('');
      return;
    }
    fetch(`/api/coding_table_configs?table=${encodeURIComponent(tableName)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (!cfg) {
          if (workbook && headers.length > 0) {
            extractHeaders(workbook, sheet, headerRow, mnHeaderRow);
          }
          setForeignKeySql('');
          setTriggerSql('');
          return;
        }
        if (!sheetSelectedManuallyRef.current) {
          sheetSelectedManuallyRef.current = false;
          setSheet(cfg.sheet ?? '');
        }
        if (!headerRowSelectedManuallyRef.current) {
          headerRowSelectedManuallyRef.current = false;
          setHeaderRow(cfg.headerRow ?? 1);
        }
        if (!mnHeaderRowSelectedManuallyRef.current) {
          mnHeaderRowSelectedManuallyRef.current = false;
          setMnHeaderRow(cfg.mnHeaderRow ?? '');
        }
        setIdFilterMode(cfg.idFilterMode ?? 'contains');
        setIdColumn(cfg.idColumn ?? '');
        setNameColumn(cfg.nameColumn ?? '');
        const extras =
          cfg.extraFields && cfg.extraFields.length > 0 ? cfg.extraFields : [''];
        setExtraFields(extras);
        setOtherColumns(cfg.otherColumns ?? []);
        setUniqueFields(cfg.uniqueFields ?? []);
        setCalcText(cfg.calcText ?? '');
        setColumnTypes(cfg.columnTypes ?? {});
        if (cfg.columnTypes) {
          const baseHeaders = Object.keys(cfg.columnTypes || {});
          const merged = Array.from(
            new Set([
              ...baseHeaders,
              ...(cfg.otherColumns || []),
              ...(cfg.uniqueFields || []),
              ...extras.filter((f) => f.trim() !== ''),
              ...(cfg.idColumn ? [cfg.idColumn] : []),
              ...(cfg.nameColumn ? [cfg.nameColumn] : []),
              ...Object.keys(cfg.renameMap || {}),
            ])
          );
          setHeaders(merged);
        }

        const fieldSet = new Set([
          ...Object.keys(cfg.columnTypes || {}),
          ...extras.filter((f) => f.trim() !== ''),
          ...(cfg.otherColumns || []),
          ...(cfg.uniqueFields || []),
          ...(cfg.idColumn ? [cfg.idColumn] : []),
          ...(cfg.nameColumn ? [cfg.nameColumn] : []),
          ...Object.keys(cfg.notNullMap || {}),
          ...Object.keys(cfg.allowZeroMap || {}),
          ...Object.keys(cfg.defaultValues || {}),
          ...Object.keys(cfg.defaultFrom || {}),
          ...Object.keys(cfg.renameMap || {}),
        ]);
        const fields = Array.from(fieldSet);
        const nn = {};
        const az = {};
        const dv = {};
        const df = {};
        const rm = {};
        fields.forEach((f) => {
          nn[f] = cfg.notNullMap && f in cfg.notNullMap ? cfg.notNullMap[f] : false;
          az[f] = cfg.allowZeroMap && f in cfg.allowZeroMap ? cfg.allowZeroMap[f] : !nn[f];
          dv[f] = cfg.defaultValues && f in cfg.defaultValues ? cfg.defaultValues[f] : '';
          df[f] = cfg.defaultFrom && f in cfg.defaultFrom ? cfg.defaultFrom[f] : '';
          rm[f] = cfg.renameMap && f in cfg.renameMap ? cfg.renameMap[f] : f;
        });
        setRenameMap(rm);
        setNotNullMap(nn);
        setAllowZeroMap(az);
        setDefaultValues(dv);
        setDefaultFrom(df);
        setPopulateRange(cfg.populateRange ?? false);
        setStartYear(cfg.startYear ?? '');
        setEndYear(cfg.endYear ?? '');
        setAutoIncStart(cfg.autoIncStart ?? '1');
        setForeignKeySql(cfg.foreignKeys ?? '');
        setTriggerSql(cfg.triggers ?? '');
      })
      .catch(() => {});
  }, [tableName, configNames]);

  return (
    <div>
      <h2>Coding Table Upload</h2>
      <input type="file" accept=".xlsx,.xls,.xlsb" onChange={handleFile} ref={fileInputRef} />
      {selectedFile && (
        <button onClick={refreshFile} style={{ marginLeft: '0.5rem' }}>Refresh File</button>
      )}
      {loadingWorkbook && (
        <div style={{ marginTop: '0.5rem' }}>
          <progress value={loadProgress} max="100" /> Loading workbook...
        </div>
      )}
      {sheets.length > 0 && (
        <div>
          <div>
            Sheet:
            <select value={sheet} onChange={handleSheetChange}>
              {sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            Field Name Row:
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={headerRow}
              onChange={handleHeaderRowChange}
            />
            Mongolian Field Name Row:
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={mnHeaderRow}
              onChange={handleMnHeaderRowChange}
              style={{ marginLeft: '0.5rem' }}
            />
            <button onClick={handleExtract}>Read Columns</button>
          </div>
          <div>
            <label style={{ marginRight: '1rem' }}>
              <input
                type="radio"
                name="idFilterMode"
                value="contains"
                checked={idFilterMode === 'contains'}
                onChange={(e) => setIdFilterMode(e.target.value)}
              />
              id column should have "id" text
            </label>
            <label>
              <input
                type="radio"
                name="idFilterMode"
                value="all"
                checked={idFilterMode === 'all'}
                onChange={(e) => setIdFilterMode(e.target.value)}
              />
              pull all columns
            </label>
          </div>
          {allFields.length > 0 && (
            <>
              <div>
                Table Name:
                <select
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                >
                  <option value="">-- new --</option>
                  {configNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <input
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Table name"
                />
                {tableName && configNames.includes(tableName) && (
                  <button
                    type="button"
                    onClick={deleteConfig}
                    style={{ marginLeft: '0.5rem' }}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div>
                Additional Fields:
                <div>
                  {extraFields.map((f, idx) => (
                    <span key={idx} style={{ marginRight: '0.5rem' }}>
                      <input
                        value={f}
                        placeholder={`Field ${idx + 1}`}
                        onChange={(e) => {
                          const vals = [...extraFields];
                          vals[idx] = e.target.value;
                          setExtraFields(vals);
                        }}
                        style={{ marginRight: '0.25rem' }}
                      />
                      <button type="button" onClick={() => removeExtraField(idx)}>
                        x
                      </button>
                    </span>
                  ))}
                  <button type="button" onClick={addExtraField}>Add Field</button>
                </div>
              </div>
              <div>
                <h4>Mongolian Field Names</h4>
                {initialDuplicates.size > 0 && (
                  <div style={{ marginBottom: '0.25rem' }}>
                    {duplicateHeaders.size > 0 ? (
                      <span style={{ color: 'red' }}>
                        Duplicate fields: {Array.from(duplicateHeaders).join(', ')}
                      </span>
                    ) : (
                      <span style={{ color: 'green' }}>
                        Duplicates renamed: {Array.from(initialDuplicates).join(', ')}
                      </span>
                    )}
                  </div>
                )}
                {allFields.map((h) => (
                  <div
                    key={h}
                    style={{
                      marginBottom: '0.25rem',
                      color: duplicateHeaders.has(h) ? 'red' : 'inherit',
                    }}
                  >
                    <code>{h}</code>
                    {' → '}
                    <input
                      value={renameMap[h] || ''}
                      placeholder={h}
                      onChange={(e) => {
                        setRenameMap({ ...renameMap, [h]: e.target.value });
                        setDuplicateHeaders((d) => {
                          const next = new Set(d);
                          next.delete(h);
                          return next;
                        });
                      }}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <input
                      value={headerMap[h] || ''}
                      onChange={(e) =>
                        setHeaderMap({ ...headerMap, [h]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <button type="button" onClick={saveMappings} style={{ marginTop: '0.5rem' }}>
                  Add Mappings
                </button>
              </div>
              {hasDateField && (
                <div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <label style={{ marginRight: '0.5rem' }}>
                      <input
                        type="radio"
                        name="populateRange"
                        value="no"
                        checked={!populateRange}
                        onChange={() => setPopulateRange(false)}
                      />
                      No Range
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="populateRange"
                        value="yes"
                        checked={populateRange}
                        onChange={() => setPopulateRange(true)}
                      />
                      Populate Range
                    </label>
                  </div>
                  {populateRange && (
                    <div style={{ marginTop: '0.5rem' }}>
                      Start Year:{' '}
                      <input
                        type="number"
                        inputMode="decimal"
                        value={startYear}
                        onChange={(e) => setStartYear(e.target.value)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      End Year:{' '}
                      <input
                        type="number"
                        inputMode="decimal"
                        value={endYear}
                        onChange={(e) => setEndYear(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                ID Column:
                <select value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                  <option value="">--none--</option>
                  {uniqueRenamedFields(idCandidates, undefined, false).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {idColumn && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    Start Value:{' '}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={autoIncStart}
                      onChange={(e) => setAutoIncStart(e.target.value)}
                      style={{ width: '6rem' }}
                    />
                  </span>
                )}
              </div>
              <div>
                Name Column:
                <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
                  <option value="">--select--</option>
                  {uniqueRenamedFields().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Unique Fields:
                <div>
                  {uniqueRenamedFields().map(({ value: h, label }) => (
                    <label key={h} style={{ marginRight: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={uniqueFields.includes(h)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUniqueFields([...uniqueFields, h]);
                            setOtherColumns(otherColumns.filter((c) => c !== h));
                          } else {
                            setUniqueFields(uniqueFields.filter((c) => c !== h));
                          }
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Other Columns:
                <div>
                  {uniqueRenamedFields().map(({ value: h, label }) => (
                    <label key={h} style={{ marginRight: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={otherColumns.includes(h)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setOtherColumns([...otherColumns, h]);
                            setUniqueFields(uniqueFields.filter((c) => c !== h));
                          } else {
                            setOtherColumns(otherColumns.filter((c) => c !== h));
                          }
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Group By Column:
                <select value={groupByField} onChange={(e) => setGroupByField(e.target.value)}>
                  <option value="">--none--</option>
                  {allFields.map((h) => (
                    <option key={h} value={h}>
                      {renameMap[h] || h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Column Types:
                <div>
                  {uniqueRenamedFields().map(({ value: h, label }) => (
                    <div key={h} style={{ marginBottom: '0.25rem' }}>
                      {label}:{' '}
                      <input
                        value={columnTypes[h] || ''}
                        onChange={(e) =>
                          setColumnTypes({
                            ...columnTypes,
                            [h]: e.target.value,
                          })
                        }
                      />
                      <label style={{ marginLeft: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={!notNullMap[h]}
                          onChange={(e) =>
                            setNotNullMap({
                              ...notNullMap,
                              [h]: !e.target.checked,
                            })
                          }
                        />
                        Allow Null
                      </label>
                      <label style={{ marginLeft: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={allowZeroMap[h] || false}
                          onChange={(e) =>
                            setAllowZeroMap({
                              ...allowZeroMap,
                              [h]: e.target.checked,
                            })
                          }
                        />
                        Allow 0
                      </label>
                      <input
                        style={{ marginLeft: '0.5rem', width: '8rem' }}
                        placeholder="Default if blank/0"
                        value={defaultValues[h] || ''}
                        onChange={(e) =>
                          setDefaultValues({
                            ...defaultValues,
                            [h]: e.target.value,
                          })
                        }
                      />
                      <select
                        value={defaultFrom[h] || ''}
                        onChange={(e) =>
                          setDefaultFrom({
                            ...defaultFrom,
                            [h]: e.target.value,
                          })
                        }
                        style={{ marginLeft: '0.25rem' }}
                      >
                        <option value="">from field...</option>
                        {uniqueRenamedFields(allFields, h).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                Calculated Fields (name: description):
                <textarea
                  rows={3}
                  cols={40}
                  value={calcText}
                  onChange={(e) => setCalcText(e.target.value)}
                />
              </div>
              <div>
                Group Size:
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  value={groupSize}
                  onChange={(e) =>
                    setGroupSize(parseInt(e.target.value, 10) || 1)
                  }
                />
              </div>
              <div>
                Foreign Keys / Indexes:
                <textarea
                  rows={3}
                  cols={40}
                  value={foreignKeySql}
                  onChange={(e) => setForeignKeySql(e.target.value)}
                />
              </div>
              <div>
                Triggers (use <code>---</code> line to separate):
                <textarea
                  rows={5}
                  cols={80}
                  value={triggerSql}
                  onChange={(e) => setTriggerSql(e.target.value)}
                />
              </div>
            <div>
              <button onClick={handleGenerateSql}>Populate SQL</button>
              <button onClick={handleGenerateRecords} style={{ marginLeft: '0.5rem' }}>
                Populate Records
              </button>
              <button onClick={loadFromSql} style={{ marginLeft: '0.5rem' }}>
                Fill Config from SQL
              </button>
              <button onClick={loadTableStructure} style={{ marginLeft: '0.5rem' }}>
                Load Structure
              </button>
              <button onClick={saveConfig} style={{ marginLeft: '0.5rem' }}>
                Save Config
              </button>
              <button onClick={executeGeneratedSql} style={{ marginLeft: '0.5rem' }}>
                Create Coding Table
              </button>
              <button onClick={executeOtherSql} style={{ marginLeft: '0.5rem' }}>
                Create _other Table
              </button>
              <button onClick={executeSeparateSql} style={{ marginLeft: '0.5rem' }}>
                Create Tables & Records
              </button>
              {(recordsSql ||
                recordsSqlOther ||
                preparedMainRows.length > 0 ||
                preparedOtherRows.length > 0) && (
                <>
                  <label style={{ marginLeft: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={useStagingInsert}
                      onChange={(e) => setUseStagingInsert(e.target.checked)}
                    />{' '}
                    Use staging table
                  </label>
                  <button onClick={executeRecordsSql} style={{ marginLeft: '0.5rem' }}>
                    Insert Records
                  </button>
                </>
              )}
            </div>
              {(structSql || recordsSql) && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                  <div>
                  <div>Main table structure:</div>
                  <textarea
                    value={structSql}
                    onChange={(e) => setStructSql(e.target.value)}
                    rows={10}
                    cols={40}
                  />
                </div>
                <div>
                  <div>Main table records: {mainCount}</div>
                  <textarea
                    value={recordsSql}
                    onChange={(e) => setRecordsSql(e.target.value)}
                    rows={10}
                    cols={40}
                    placeholder="No records generated"
                  />
                </div>
                </div>
              )}
              {(structSqlOther || recordsSqlOther) && (
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <div>
                  <div>_other table structure:</div>
                  <textarea
                    value={structSqlOther}
                    onChange={(e) => setStructSqlOther(e.target.value)}
                    rows={10}
                    cols={40}
                  />
                </div>
                <div>
                  <div>_other table records: {otherCount + dupCount}</div>
                  <textarea
                    value={recordsSqlOther}
                    onChange={(e) => setRecordsSqlOther(e.target.value)}
                    rows={10}
                    cols={40}
                    placeholder="No records generated"
                  />
                </div>
              </div>
              )}
              {sqlMove && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>SQL to move unsuccessful rows: {countSqlRows(sqlMove)}</div>
                  <textarea
                    value={sqlMove}
                    onChange={(e) => setSqlMove(e.target.value)}
                    rows={4}
                    cols={80}
                  />
                </div>
              )}
              {duplicateInfo && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>Duplicate keys: {duplicateInfo.split('\n').length}</div>
                  <textarea value={duplicateInfo} readOnly rows={3} cols={80} />
                </div>
              )}
              {duplicateRecords && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>Duplicate records: {duplicateRecords.split('\n').length}</div>
                  <textarea value={duplicateRecords} readOnly rows={3} cols={80} />
                </div>
              )}
              {summaryInfo && (
                <div style={{ marginTop: '0.5rem' }}>{summaryInfo}</div>
              )}
              {uploading && (
                <div style={{ marginTop: '1rem' }}>
                  <progress
                    value={uploadProgress.done}
                    max={uploadProgress.total || 1}
                  />{' '}
                  {groupMessage || 'Creating table...'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
