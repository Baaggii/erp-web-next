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

  const allHeaders = useMemo(
    () => [...headers, ...extraFields.filter((f) => f.trim() !== '')],
    [headers, extraFields]
  );

  const hasDateField = useMemo(
    () => allHeaders.some((h) => /year|month|date/i.test(h)),
    [allHeaders]
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
      setSql('');
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
    setSql('');
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
    setSql('');
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
      az[h] = false;
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
    const m = sqlText.match(/CREATE TABLE IF NOT EXISTS\s+`([^`]+)`\s*\(([^]*?)\)\s*(?:AUTO_INCREMENT=(\d+))?;/m);
    if (!m) return null;
    const table = m[1];
    const body = m[2];
    const autoInc = m[3] || '1';
    const lines = body
      .split(/,\n/)
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
      allowZeroMap: {},
      defaultValues: defaults,
      autoIncStart: autoInc,
    };
  }

  function loadFromSql() {
    const cfg = parseSqlConfig(sql);
    if (!cfg) return;
    setTableName(cfg.table);
    setIdColumn(cfg.idColumn);
    setNameColumn(cfg.nameColumn);
    setOtherColumns(cfg.otherColumns);
    setUniqueFields(cfg.uniqueFields);
    setCalcText(cfg.calcText);
    setColumnTypes(cfg.columnTypes);
    setNotNullMap(cfg.notNullMap);
    setAllowZeroMap(cfg.allowZeroMap || {});
    setDefaultValues(cfg.defaultValues);
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
      setSql(data.sql || '');
      if (data.sql) {
        const cfg = parseSqlConfig(data.sql);
        if (cfg) {
          setIdColumn(cfg.idColumn);
          setNameColumn(cfg.nameColumn);
          setOtherColumns(cfg.otherColumns);
          setUniqueFields(cfg.uniqueFields);
          setCalcText(cfg.calcText);
          setColumnTypes(cfg.columnTypes);
          setNotNullMap(cfg.notNullMap);
          setAllowZeroMap(cfg.allowZeroMap || {});
          setDefaultValues(cfg.defaultValues);
          setAutoIncStart(cfg.autoIncStart || '1');
        }
      }
    } catch {
      // ignore errors
    }
  }

  function handleGenerateSql() {
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
      ...(idCol ? [idCol] : []),
      ...(nmCol ? [nmCol] : []),
      ...uniqueOnly,
      ...otherFiltered,
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
    if (populateRange) {
      finalRows = finalRows.filter((r) =>
        fieldsToCheck.every((f) => {
          const idxF = allHdrs.indexOf(f);
          if (idxF === -1) return true;
          const v = r[idxF];
          if (v === null) return false;
          if (v === 0 && !allowZeroMap[f]) return false;
          return true;
        })
      );
    }

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
        return v === null || (v === 0 && !allowZeroMap[f]);
      });
      const stateVal = stateIdx === -1 ? '1' : String(r[stateIdx]);
      if (!zeroInvalid && stateVal === '1') mainRows.push(r);
      else otherRows.push(r);
    });
    setDuplicateInfo(dupList.join('\n'));

    let defs = [];
    if (idCol) {
      defs.push(`\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nmCol) {
      let def = `\`${dbNameCol}\` ${colTypes[nmCol]} NOT NULL`;
      if (defaultValues[nmCol]) {
        def += ` DEFAULT ${formatVal(defaultValues[nmCol], colTypes[nmCol])}`;
      }
      defs.push(def);
    }
    uniqueOnly.forEach((c) => {
      const dbC = dbCols[c];
      let def = `\`${dbC}\` ${colTypes[c]} NOT NULL`;
      if (defaultValues[c]) {
        def += ` DEFAULT ${formatVal(defaultValues[c], colTypes[c])}`;
      }
      defs.push(def);
    });
    otherFiltered.forEach((c) => {
      const dbC = dbCols[c];
      let def = `\`${dbC}\` ${colTypes[c]}`;
      if (localNotNull[c]) def += ' NOT NULL';
      if (defaultValues[c]) {
        def += ` DEFAULT ${formatVal(defaultValues[c], colTypes[c])}`;
      }
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
    const defsNoUnique = defs.filter((d) => !d.trim().startsWith('UNIQUE KEY'));

    function buildSql(rows, tableNameForSql, useUnique = true) {
      const defArr = useUnique ? defs : defsNoUnique;
      let out = `CREATE TABLE IF NOT EXISTS \`${tableNameForSql}\` (\n  ${defArr.join(',\n  ')}\n)${idCol ? ` AUTO_INCREMENT=${autoIncStart}` : ''};\n`;
      for (const r of rows) {
        const cols = [];
        const vals = [];
        let hasData = false;
        if (nmCol) {
          const nameVal = r[nameIdx];
          if (nameVal === undefined || nameVal === null || nameVal === '') continue;
          cols.push(`\`${dbNameCol}\``);
          vals.push(formatVal(nameVal, colTypes[nmCol]));
          hasData = true;
        }
        uniqueOnly.forEach((c, idx2) => {
          const ui = uniqueIdx[idx2];
          let v = defaultValues[c];
          if (v === undefined || v === '' || (!allowZeroMap[c] && v === 0)) {
            const from = defaultFrom[c];
            if (from) {
              const fi = allHdrs.indexOf(from);
              v = fi === -1 ? undefined : r[fi];
            } else {
              v = ui === -1 ? defaultValForType(colTypes[c]) : r[ui];
            }
            if (v === undefined || v === null || v === '' || (!allowZeroMap[c] && v === 0)) {
              v = defaultValForType(colTypes[c]);
            }
          }
          cols.push(`\`${dbCols[c]}\``);
          vals.push(formatVal(v, colTypes[c]));
          hasData = true;
        });
        otherFiltered.forEach((c, idx2) => {
          const ci = otherIdx[idx2];
          let v = defaultValues[c];
          if (v === undefined || v === '' || (!allowZeroMap[c] && v === 0)) {
            const from = defaultFrom[c];
            if (from) {
              const fi = allHdrs.indexOf(from);
              v = fi === -1 ? undefined : r[fi];
            } else {
              v = ci === -1 ? undefined : r[ci];
            }
            if ((v === undefined || v === null || v === '' || (!allowZeroMap[c] && v === 0)) && localNotNull[c]) {
              v = defaultValForType(colTypes[c]);
            }
          }
          if (v !== undefined && v !== null && v !== '' && (allowZeroMap[c] ? true : v !== 0)) hasData = true;
          cols.push(`\`${dbCols[c]}\``);
          vals.push(formatVal(v, colTypes[c]));
        });
        if (!hasData) continue;
        if (
          populateRange &&
          vals.some((v, i) => {
            const field = cols[i].replace(/`/g, '');
            if (v === 'NULL') return true;
            if (v === '0' && !allowZeroMap[field]) return true;
            return false;
          })
        )
          continue;
        const updates = cols.map((c) => `${c} = VALUES(${c})`);
        out += `INSERT INTO \`${tableNameForSql}\` (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ')};\n`;
      }
      return out;
    }

    const sqlStr = buildSql(mainRows, tbl, true);
    const otherCombined = [...otherRows, ...dupRows];
    const sqlOtherStr =
      otherCombined.length > 0 ? buildSql(otherCombined, `${tbl}_other`, false) : '';
    setSql(sqlStr);
    setSqlOther(sqlOtherStr);
    setSummaryInfo(
      `Prepared ${finalRows.length} rows, duplicates: ${dupList.length}`
    );
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


  async function executeGeneratedSql() {
    if (!sql) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const statements = sql
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
    if (!sqlOther) {
      alert('Generate SQL first');
      return;
    }
    setUploading(true);
    try {
      const res = await fetch('/api/generated_sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlOther }),
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
      columnTypes,
      notNullMap,
      allowZeroMap,
      defaultValues,
      defaultFrom,
      renameMap,
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
        let toSave = sql;
        if (sql.length > 5_000_000) {
          const first = sql.split(/;\s*\n/)[0];
          toSave = `${first.trim()};`;
          addToast('SQL too large, saving only table structure', 'info');
        }
        const resSql = await fetch('/api/generated_sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ table: tableName, sql: toSave }),
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
    setIdCandidates(computeIdCandidates(allHeaders, extraFields, idFilterMode));
    setUniqueFields((u) => u.filter((f) => allHeaders.includes(f)));
    setOtherColumns((o) => o.filter((f) => allHeaders.includes(f)));
    setNotNullMap((m) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = m[h] || false;
      });
      return updated;
    });
    setAllowZeroMap((m) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = m[h] || false;
      });
      return updated;
    });
    setDefaultValues((d) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = d[h] || '';
      });
      return updated;
    });
    setDefaultFrom((d) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = d[h] || '';
      });
      return updated;
    });
    setRenameMap((m) => {
      const updated = {};
      allHeaders.forEach((h) => {
        updated[h] = m[h] || h;
      });
      return updated;
    });
    if (idColumn && !allHeaders.includes(idColumn)) setIdColumn('');
    if (nameColumn && !allHeaders.includes(nameColumn)) setNameColumn('');
  }, [allHeaders, idFilterMode]);

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
        setOtherColumns(cfg.otherColumns || []);
        setUniqueFields(cfg.uniqueFields || []);
        setCalcText(cfg.calcText || '');
        setColumnTypes(cfg.columnTypes || {});
        setNotNullMap(cfg.notNullMap || {});
        setAllowZeroMap(cfg.allowZeroMap || {});
        setDefaultValues(cfg.defaultValues || {});
        setDefaultFrom(cfg.defaultFrom || {});
        setRenameMap(cfg.renameMap || {});
        setExtraFields(
          cfg.extraFields && cfg.extraFields.length > 0 ? cfg.extraFields : ['']
        );
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
          {allHeaders.length > 0 && (
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
                {headers.map((h) => (
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
                  {allHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                Unique Fields:
                <div>
                  {allHeaders.map((h) => (
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
                  {allHeaders.map((h) => (
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
                  {allHeaders.map((h) => (
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
                        {allHeaders
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
              {sqlOther && (
                <button onClick={executeOtherSql} style={{ marginLeft: '0.5rem' }}>
                  Create _other Table
                </button>
              )}
            </div>
              {sql && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>SQL for main table:</div>
                  <textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    rows={10}
                    cols={80}
                  />
                </div>
              )}
              {sqlOther && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div>SQL for _other table:</div>
                  <textarea
                    value={sqlOther}
                    onChange={(e) => setSqlOther(e.target.value)}
                    rows={10}
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
