import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { translateToMn } from '../utils/translateToMn.js';
import { useToast } from '../context/ToastContext.jsx';

function cleanIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]+/g, '');
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
  const [sqlMove, setSqlMove] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [insertedCount, setInsertedCount] = useState(0);
  const [columnTypes, setColumnTypes] = useState({});
  const [notNullMap, setNotNullMap] = useState({});
  const [allowZeroMap, setAllowZeroMap] = useState({});
  const [defaultValues, setDefaultValues] = useState({});
  const [defaultFrom, setDefaultFrom] = useState({});
  const [extraFields, setExtraFields] = useState(['']);
  const [headerMap, setHeaderMap] = useState({});
  const [renameMap, setRenameMap] = useState({});
  const [populateRange, setPopulateRange] = useState(false);
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [autoIncStart, setAutoIncStart] = useState('1');
  const [duplicateInfo, setDuplicateInfo] = useState('');
  const [duplicateRecords, setDuplicateRecords] = useState('');
  const [summaryInfo, setSummaryInfo] = useState('');
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [configNames, setConfigNames] = useState([]);

  useEffect(() => {
    fetch('/api/coding_table_configs', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigNames(Object.keys(data)))
      .catch(() => setConfigNames([]));
  }, []);

  const allFields = useMemo(() => {
    const list = [
      ...headers,
      ...extraFields.filter((f) => f.trim() !== ''),
    ];
    return Array.from(new Set(list));
  }, [headers, extraFields]);

  const hasDateField = useMemo(
    () => allFields.some((h) => /year|month|date/i.test(h)),
    [allFields]
  );

  function computeIdCandidates(hdrs, extras, mode) {
    const strs = hdrs.filter((h) => typeof h === 'string');
    const extraList = extras.filter((f) => typeof f === 'string' && f.trim() !== '');
    if (mode === 'contains') {
      const ids = strs.filter((h) => h.toLowerCase().includes('id'));
      const base = ids.length > 0 ? ids : strs;
      return Array.from(new Set([...base, ...extraList]));
    }
    return Array.from(new Set([...strs, ...extraList]));
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

  function loadWorkbook(file) {
    file.arrayBuffer().then((ab) => {
      const wb = XLSX.read(ab);
      setWorkbook(wb);
      setSheets(wb.SheetNames);
      const firstSheet = wb.SheetNames[0];
      setSheet(firstSheet);
      setHeaderRow(1);
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
    });
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    loadWorkbook(file);
  }

  function handleSheetChange(e) {
    const s = e.target.value;
    setSheet(s);
    setHeaders([]);
    setHeaderMap({});
    setMnHeaderRow('');
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

  function handleHeaderRowChange(e) {
    const r = Number(e.target.value) || 1;
    setHeaderRow(r);
    setHeaders([]);
    setHeaderMap({});
    setMnHeaderRow('');
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
    raw.forEach((h, i) => {
      if (String(h).trim().length > 0) {
        hdrs.push(cleanIdentifier(h));
        keepIdx.push(i);
        const mnVal = mnRaw[i];
        if (mnVal && String(mnVal).trim()) {
          map[cleanIdentifier(h)] = String(mnVal).trim();
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
      nn[h] = valsByHeader[h].every(
        (v) => v !== undefined && v !== null && v !== ''
      );
    });
    setNotNullMap(nn);
    const az = {};
    hdrs.forEach((h) => {
      az[h] = !nn[h];
    });
    setAllowZeroMap(az);
  }

  function handleExtract() {
    if (!workbook) return;
    extractHeaders(workbook, sheet, headerRow, mnHeaderRow);
  }

  function removeSqlUnsafeChars(v) {
    if (typeof v !== 'string') return v;
    return v.replace(/[\\/"']/g, '');
  }

  function escapeSqlValue(v) {
    const sanitized = removeSqlUnsafeChars(v);
    return `'${String(sanitized).replace(/'/g, "''")}'`;
  }

  function detectType(name, vals) {
    const lower = String(name).toLowerCase();
    if (lower.includes('_per')) return 'DECIMAL(5,2)';
    if (lower.includes('date')) return 'DATE';
    for (const v of vals) {
      if (v === undefined || v === '') continue;
      const n = Number(v);
      if (!Number.isNaN(n)) {
        const str = String(v);
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
    if (val === undefined || val === null || val === '') return 'NULL';
    if (type === 'DATE') {
      const d = parseExcelDate(val);
      if (!d) return 'NULL';
      return `'${d.toISOString().slice(0, 10)}'`;
    }
    if (type === 'INT' || type.startsWith('DECIMAL')) return String(val);
    return escapeSqlValue(val);
  }

  function defaultValForType(type) {
    if (!type) return 0;
    if (type === 'DATE') return 0;
    if (type === 'INT' || type.startsWith('DECIMAL')) return 0;
    return 0;
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
      .split(/,\s*\n/)
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
      if (ln.startsWith('UNIQUE KEY')) {
        uniqueLine = ln;
        continue;
      }
      const colMatch = ln.match(/^`([^`]+)`\s+([^ ]+)(.*)$/);
      if (!colMatch) continue;
      const col = colMatch[1];
      const type = colMatch[2];
      const rest = colMatch[3] || '';
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
    };
  }

  function loadFromSql() {
    const base = structSql || sql;
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
      setStructSql(data.sql || '');
      setStructSqlOther('');
      setRecordsSql('');
      setRecordsSqlOther('');
      setSql(data.sql || '');
      setSqlOther('');
      setSqlMove('');
      if (data.sql) {
        const cfg = parseSqlConfig(data.sql);
        if (cfg) {
          setHeaders(Object.keys(cfg.columnTypes || {}));
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
    raw.forEach((h, i) => {
      if (String(h).trim().length > 0) {
        hdrs.push(cleanIdentifier(h));
        keepIdx.push(i);
      }
    });
    const extra = extraFields.filter((f) => f.trim() !== '').map(cleanIdentifier);
    const rows = data
      .slice(idx + 1)
      .map((r) => [...keepIdx.map((ci) => r[ci]), ...Array(extra.length).fill(undefined)]);
    const allHdrs = [...hdrs, ...extra];
    const dbCols = {};
    allHdrs.forEach((h) => {
      dbCols[h] = cleanIdentifier(renameMap[h] || h);
    });

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
    const dbIdCol = idCol ? cleanIdentifier(renameMap[idCol] || 'id') : null;
    const dbNameCol = nmCol ? cleanIdentifier(renameMap[nmCol] || 'name') : null;
    if (idCol && idIdx === -1) return;
    if (nmCol && nameIdx === -1) return;
    const uniqueIdx = uniqueOnly.map((c) => allHdrs.indexOf(c));
    const otherIdx = otherFiltered.map((c) => allHdrs.indexOf(c));
    const stateIdx = allHdrs.findIndex((h) => /state/i.test(h));

    const fieldsToCheck = [
      ...(idCol && idIdx !== -1 ? [idCol] : []),
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
        dupRows.push(r);
        dupList.push(key);
        return;
      }
      const zeroInvalid = fieldsToCheck.some((f) => {
        const idxF = allHdrs.indexOf(f);
        if (idxF === -1) return false;
        const v = r[idxF];
        const isZero =
          v === 0 || (typeof v === 'string' && v.trim() !== '' && Number(v) === 0);
        return v === null || (isZero && !allowZeroMap[f]);
      });
      const stateVal = stateIdx === -1 ? '1' : String(r[stateIdx]);
      if (!zeroInvalid && stateVal === '1') mainRows.push(r);
      else otherRows.push(r);
    });
    setDuplicateInfo(dupList.join('\n'));
    setDuplicateRecords(dupRows.map((r) => r.join(',')).join('\n'));

    let extras = [];
    if (sql) {
      const m = sql.match(/CREATE TABLE[^\(]*\([^]*?\)/m);
      if (m) {
        const body = m[0].replace(/^[^\(]*\(|\)[^\)]*$/g, '');
        const lines = body.split(/,\n/).map((l) => l.trim());
        extras = lines.filter((l) => /^(KEY|CONSTRAINT|FOREIGN KEY)/i.test(l));
      }
    }

    let defs = [];
    if (idCol) {
      defs.push(`\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nmCol) {
      defs.push(`\`${dbNameCol}\` ${colTypes[nmCol]} NOT NULL`);
    }
    uniqueOnly.forEach((c) => {
      const dbC = dbCols[c];
      defs.push(`\`${dbC}\` ${colTypes[c]} NOT NULL`);
    });
    otherFiltered.forEach((c) => {
      const dbC = dbCols[c];
      let def = `\`${dbC}\` ${colTypes[c]}`;
      if (localNotNull[c]) def += ' NOT NULL';
      defs.push(def);
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

    function buildStructure(tableNameForSql, useUnique = true) {
      const defArr = useUnique ? defs : defsNoUnique;
      return `CREATE TABLE IF NOT EXISTS \`${tableNameForSql}\` (\n  ${defArr.join(',\n  ')}\n)${idCol ? ` AUTO_INCREMENT=${autoIncStart}` : ''};\n`;
    }

    function buildInsert(rows, tableNameForSql, fields) {
      if (!rows.length || !fields.length) return '';
      const cols = fields.map((f) => `\`${dbCols[f] || cleanIdentifier(renameMap[f] || f)}\``);
      const idxMap = fields.map((f) => allHdrs.indexOf(f));
      let out = '';
      for (const r of rows) {
        if (nmCol) {
          const nameVal = r[nameIdx];
          if (nameVal === undefined || nameVal === null || nameVal === '') continue;
        }
        let hasData = false;
        const vals = idxMap.map((idx, i) => {
          const f = fields[i];
          let v = idx === -1 ? undefined : r[idx];
          if (v === undefined || v === null || v === '') {
            const from = defaultFrom[f];
            if (from) {
              const fi = allHdrs.indexOf(from);
              v = fi === -1 ? undefined : r[fi];
            }
            if (v === undefined || v === null || v === '') {
              v = defaultValues[f];
            }
            if ((v === undefined || v === null || v === '') && localNotNull[f]) {
              v = defaultValForType(colTypes[f]);
            }
          }
          if (v !== undefined && v !== null && v !== '' && (allowZeroMap[f] ? true : v !== 0)) {
            hasData = true;
          }
          return formatVal(v, colTypes[f]);
        });
        if (!hasData) continue;
        const updates = cols.map((c) => `${c} = VALUES(${c})`);
        out += `INSERT INTO \`${tableNameForSql}\` (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ')};\n`;
      }
      return out;
    }

    const fields = [
      ...(idCol && idIdx !== -1 ? [idCol] : []),
      ...(nmCol ? [nmCol] : []),
      ...uniqueOnly,
      ...otherFiltered,
      ...extra,
    ];

    const structMainStr = buildStructure(tbl, true);
    const insertMainStr = buildInsert(mainRows, tbl, fields);
    const otherCombined = [...otherRows, ...dupRows];
    const structOtherStr = buildStructure(`${tbl}_other`, false);
    const insertOtherStr = buildInsert(otherCombined, `${tbl}_other`, fields);
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
    }
    setSummaryInfo(
      `Prepared ${finalRows.length} rows, duplicates: ${dupList.length}`
    );
  }

  function handleGenerateSql() {
    setStructSql('');
    setStructSqlOther('');
    setRecordsSql('');
    setRecordsSqlOther('');
    generateFromWorkbook({ structure: true, records: true });
  }

  function handleGenerateRecords() {
    setRecordsSql('');
    setRecordsSqlOther('');
    generateFromWorkbook({ structure: false, records: true });
  }


  async function executeGeneratedSql() {
    if (!structSql) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const statements = structSql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s + ';');
      const chunks = [];
      let current = [];
      let size = 0;
      const limit = 500000; // ~0.5MB per chunk
      for (const stmt of statements) {
        const len = stmt.length + 1; // include newline
        if (size + len > limit && current.length) {
          chunks.push(current.join('\n'));
          current = [];
          size = 0;
        }
        current.push(stmt);
        size += len;
      }
      if (current.length) chunks.push(current.join('\n'));
      setUploadProgress({ done: 0, total: chunks.length });
      setInsertedCount(0);
      let totalInserted = 0;
      const failedAll = [];
      for (const chunk of chunks) {
        const res = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: chunk }),
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Execution failed');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const inserted = data.inserted || 0;
        if (Array.isArray(data.failed) && data.failed.length > 0) {
          failedAll.push(
            ...data.failed.map((f) =>
              typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
            )
          );
        }
        totalInserted += inserted;
        setInsertedCount(totalInserted);
        addToast(`Inserted ${totalInserted} records`, 'info');
        setUploadProgress((p) => ({ done: p.done + 1, total: chunks.length }));
      }
      setSummaryInfo(
        `Inserted ${totalInserted} rows. Duplicates: ${
          duplicateInfo ? duplicateInfo.split('\n').length : 0
        }`
      );
      if (failedAll.length > 0) {
        setSqlMove(failedAll.join('\n'));
      }
      addToast(`Table created with ${totalInserted} rows`, 'success');
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
      const statements = combined
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s + ';');
      const chunks = [];
      let current = [];
      let size = 0;
      const limit = 500000;
      for (const stmt of statements) {
        const len = stmt.length + 1;
        if (size + len > limit && current.length) {
          chunks.push(current.join('\n'));
          current = [];
          size = 0;
        }
        current.push(stmt);
        size += len;
      }
      if (current.length) chunks.push(current.join('\n'));
      setUploadProgress({ done: 0, total: chunks.length });
      setInsertedCount(0);
      let totalInserted = 0;
      const failedAll = [];
      for (const chunk of chunks) {
        const res = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: chunk }),
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Execution failed');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const inserted = data.inserted || 0;
        if (Array.isArray(data.failed) && data.failed.length > 0) {
          failedAll.push(
            ...data.failed.map((f) =>
              typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
            )
          );
        }
        totalInserted += inserted;
        setInsertedCount(totalInserted);
        addToast(`Inserted ${totalInserted} records`, 'info');
        setUploadProgress((p) => ({ done: p.done + 1, total: chunks.length }));
      }
      setSummaryInfo(
        `Inserted ${totalInserted} rows. Duplicates: ${
          duplicateInfo ? duplicateInfo.split('\n').length : 0
        }`
      );
      if (failedAll.length > 0) {
        setSqlMove(failedAll.join('\n'));
      }
      addToast(`Table created with ${totalInserted} rows`, 'success');
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
      const res = await fetch('/api/generated_sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: structSqlOther }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Execution failed');
        return;
      }
      const data = await res.json().catch(() => ({}));
      addToast(`Other table inserted ${data.inserted || 0} rows`, 'success');
    } catch (err) {
      console.error('SQL execution failed', err);
      alert('Execution failed');
    } finally {
      setUploading(false);
    }
  }

  async function executeRecordsSql() {
    if (!recordsSql && !recordsSqlOther) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const failedAll = [];
      if (recordsSql) {
        const resMain = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: recordsSql }),
          credentials: 'include',
        });
        if (!resMain.ok) throw new Error('main failed');
        const dataMain = await resMain.json().catch(() => ({}));
        if (Array.isArray(dataMain.failed))
          failedAll.push(
            ...dataMain.failed.map((f) =>
              typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
            )
          );
      }
      if (recordsSqlOther) {
        const resOther = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: recordsSqlOther }),
          credentials: 'include',
        });
        if (!resOther.ok) throw new Error('other failed');
        const dataOther = await resOther.json().catch(() => ({}));
        if (Array.isArray(dataOther.failed))
          failedAll.push(
            ...dataOther.failed.map((f) =>
              typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
            )
          );
      }
      if (failedAll.length > 0) {
        const tbl = cleanIdentifier(tableName);
        const moveSql = failedAll
          .map((stmt) => {
            const re = new RegExp(`INSERT INTO\\s+\`${tbl}\``, 'i');
            if (re.test(stmt) && !/\_other`/i.test(stmt)) {
              return stmt.replace(re, `INSERT INTO \`${tbl}_other\``);
            }
            return stmt;
          })
          .join('\n');
        const resMove = await fetch('/api/generated_sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: moveSql }),
          credentials: 'include',
        });
        if (!resMove.ok) {
          setSqlMove(moveSql);
        } else {
          const dataMove = await resMove.json().catch(() => ({}));
          if (Array.isArray(dataMove.failed) && dataMove.failed.length > 0) {
            setSqlMove(
              dataMove.failed
                .map((f) =>
                  typeof f === 'string' ? f : `${f.sql} -- ${f.error}`
                )
                .join('\n')
            );
          }
        }
      }
      addToast('Records inserted', 'success');
    } catch (err) {
      console.error('SQL execution failed', err);
      alert('Execution failed');
    } finally {
      setUploading(false);
    }
  }

  async function saveMappings() {
    try {
      await fetch('/api/header_mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mappings: headerMap }),
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
    return null;
  }

  async function saveConfig() {
    if (!tableName) {
      addToast('Table name required', 'error');
      return;
    }
    const usedFields = new Set([
      idColumn,
      nameColumn,
      ...otherColumns,
      ...uniqueFields,
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
        else struct = sql.split(/;\s*\n/)[0] + ';';
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
    setIdCandidates(computeIdCandidates(allFields, extraFields, idFilterMode));
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
  }, [allFields, idFilterMode, notNullMap]);

  useEffect(() => {
    if (!tableName) return;
    fetch(`/api/coding_table_configs?table=${encodeURIComponent(tableName)}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setSheet(cfg.sheet || sheet);
        setHeaderRow(cfg.headerRow || 1);
        setMnHeaderRow(cfg.mnHeaderRow || '');
        setIdFilterMode(cfg.idFilterMode || 'contains');
        setIdColumn(cfg.idColumn || '');
        setNameColumn(cfg.nameColumn || '');
        const extras =
          cfg.extraFields && cfg.extraFields.length > 0 ? cfg.extraFields : [''];
        setExtraFields(extras);
        setOtherColumns(cfg.otherColumns || []);
        setUniqueFields(cfg.uniqueFields || []);
        setCalcText(cfg.calcText || '');
        setColumnTypes(cfg.columnTypes || {});
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

        setNotNullMap(nn);
        setAllowZeroMap(az);
        setDefaultValues(dv);
        setDefaultFrom(df);
        setRenameMap(rm);
        setPopulateRange(cfg.populateRange || false);
        setStartYear(cfg.startYear || '');
        setEndYear(cfg.endYear || '');
        setAutoIncStart(cfg.autoIncStart || '1');
      })
      .catch(() => {});
  }, [tableName]);

  return (
    <div>
      <h2>Coding Table Upload</h2>
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} ref={fileInputRef} />
      {selectedFile && (
        <button onClick={refreshFile} style={{ marginLeft: '0.5rem' }}>Refresh File</button>
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
              min="1"
              value={headerRow}
              onChange={handleHeaderRowChange}
            />
            Mongolian Field Name Row:
            <input
              type="number"
              min="1"
              value={mnHeaderRow}
              onChange={(e) => setMnHeaderRow(e.target.value)}
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
                {allFields.map((h) => (
                  <div key={h} style={{ marginBottom: '0.25rem' }}>
                    {h}:{' '}
                    <input
                      value={renameMap[h] || h}
                      onChange={(e) =>
                        setRenameMap({ ...renameMap, [h]: e.target.value })
                      }
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
                        value={startYear}
                        onChange={(e) => setStartYear(e.target.value)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      End Year:{' '}
                      <input
                        type="number"
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
                  {idCandidates.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {idColumn && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    Start Value:{' '}
                    <input
                      type="number"
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
                  {allFields.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Unique Fields:
                <div>
                  {allFields.map((h) => (
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
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Other Columns:
                <div>
                  {allFields.map((h) => (
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
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                Column Types:
                <div>
                  {allFields.map((h) => (
                    <div key={h} style={{ marginBottom: '0.25rem' }}>
                      {h}:{' '}
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
                        {allFields
                          .filter((x) => x !== h)
                          .map((o) => (
                            <option key={o} value={o}>
                              {o}
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
              {(recordsSql || recordsSqlOther) && (
                <button onClick={executeRecordsSql} style={{ marginLeft: '0.5rem' }}>
                  Insert Records
                </button>
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
                    <div>Main table records:</div>
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
                  <div>_other table records:</div>
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
                  <div>SQL to move unsuccessful rows:</div>
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
                  <div>Duplicate keys:</div>
                  <textarea value={duplicateInfo} readOnly rows={3} cols={80} />
                </div>
              )}
              {duplicateRecords && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>Duplicate records:</div>
                  <textarea value={duplicateRecords} readOnly rows={3} cols={80} />
                </div>
              )}
              {summaryInfo && (
                <div style={{ marginTop: '0.5rem' }}>{summaryInfo}</div>
              )}
              {uploading && (
                <div style={{ marginTop: '1rem' }}>
                  <progress value={uploadProgress.done} max={uploadProgress.total || 1} /> Creating table...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
