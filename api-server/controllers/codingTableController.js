import fs from 'fs';
import crypto from 'crypto';
let xlsx;
try {
  const mod = await import('xlsx');
  xlsx = mod.default || mod;
} catch {
  xlsx = { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [] } };
}
import { pool, setTableColumnLabel } from '../../db/index.js';

function cleanIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]+/g, '');
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

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val.replace(/[\\/"'\[\]]/g, '');
  }
  return val;
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
      if (!Number.isNaN(num)) {
        return num;
      }
      return replaced;
    }
  }
  return val;
}

export function detectType(name, vals) {
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
    const hash = crypto.createHash('sha1').update(base).digest('hex').slice(0, 8);
    return `uniq_${hash}`;
  }
  return base;
}

export async function uploadCodingTable(req, res, next) {
  try {
    const {
      sheet,
      tableName,
      idColumn,
      nameColumn,
      headerRow,
      otherColumns,
      extraFields,
      uniqueFields,
      calcFields,
      columnTypes: columnTypesJson,
      notNullMap: notNullJson,
      defaultValues: defaultValuesJson,
      headerMap: headerMapJson,
      autoIncrementStart,
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
    const extraFieldCols = extraFields ? JSON.parse(extraFields) : [];
    const uniqueCols = uniqueFields ? JSON.parse(uniqueFields) : [];
    const cleanTable = cleanIdentifier(tableName);
    const cleanIdCol = idColumn ? cleanIdentifier(idColumn) : '';
    const cleanNameCol = nameColumn ? cleanIdentifier(nameColumn) : '';
    const cleanExtra = extraCols.map(cleanIdentifier);
    const cleanExtraFields = extraFieldCols.map(cleanIdentifier);
    const cleanUnique = uniqueCols.map(cleanIdentifier);
    const calcDefs = calcFields ? JSON.parse(calcFields) : [];
    const columnTypeOverride = columnTypesJson ? JSON.parse(columnTypesJson) : {};
    const notNullOverride = notNullJson ? JSON.parse(notNullJson) : {};
    const defaultValues = defaultValuesJson ? JSON.parse(defaultValuesJson) : {};
    const headerMap = headerMapJson ? JSON.parse(headerMapJson) : {};
    const autoIncStart = parseInt(autoIncrementStart || '1', 10) || 1;
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = sheet || workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      return res.status(400).json({ error: 'Sheet not found' });
    }
    const headerIndex = parseInt(headerRow || '1', 10);
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    const rawHeaders = data[headerIndex - 1] || [];
    const keepIdx = [];
    const headers = [];
    rawHeaders.forEach((h, idx) => {
      if (String(h).trim().length > 0) {
        const clean = cleanIdentifier(h);
        headers.push(clean);
        keepIdx.push(idx);
      }
    });
    if (headers.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Header row not found' });
    }
    const uniqueOnly = cleanUnique.filter(
      (c) =>
        c !== cleanIdCol &&
        c !== cleanNameCol &&
        !cleanExtra.includes(c) &&
        !cleanExtraFields.includes(c)
    );
    const extraFiltered = cleanExtra.filter(
      (c) => c !== cleanIdCol && c !== cleanNameCol && !uniqueOnly.includes(c)
    );
    const extraFieldFiltered = cleanExtraFields.filter(
      (c) => c !== cleanIdCol && c !== cleanNameCol && !uniqueOnly.includes(c)
    );
    if (
      !cleanIdCol &&
      !cleanNameCol &&
      uniqueOnly.length === 0 &&
      extraFiltered.length === 0 &&
      extraFieldFiltered.length === 0
    ) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No columns selected' });
    }
    const rows = data.slice(headerIndex).map((row) => {
      const obj = {};
      keepIdx.forEach((colIdx, hIdx) => {
        const h = headers[hIdx];
        obj[h] = row[colIdx];
      });
      return obj;
    });
    const addedFields = [
      ...new Set([
        ...uniqueOnly,
        ...extraFiltered,
        ...extraFieldFiltered,
        cleanIdCol,
        cleanNameCol,
      ].filter((c) => c && !headers.includes(c)))
    ];
    rows.forEach((r) => {
      addedFields.forEach((f) => {
        if (!(f in r)) r[f] = undefined;
      });
    });
    const allHeaders = [...headers, ...addedFields];
    const valuesByHeader = {};
    allHeaders.forEach((h) => {
      valuesByHeader[h] = rows.map((r) => r[h]);
    });
    const columnTypes = {};
    const notNullMap = {};
    headers.forEach((h) => {
      columnTypes[h] = detectType(h, valuesByHeader[h]);
      const defNN = valuesByHeader[h].every(
        (v) => v !== undefined && v !== null && v !== ''
      );
      notNullMap[h] =
        notNullOverride[h] !== undefined ? notNullOverride[h] : defNN;
    });
    addedFields.forEach((f) => {
      columnTypes[f] = columnTypeOverride[f] || 'VARCHAR(255)';
      notNullMap[f] = notNullOverride[f] || false;
    });
    for (const [col, typ] of Object.entries(columnTypeOverride)) {
      columnTypes[col] = typ;
    }
    for (const [col, val] of Object.entries(notNullOverride)) {
      notNullMap[col] = val;
    }

    let finalRows = rows;
    if (
      req.body.populateRange === 'true' &&
      req.body.startYear &&
      req.body.endYear
    ) {
      const yearField = allHeaders.find((h) => /year/i.test(h));
      if (yearField) {
        const monthField = allHeaders.find((h) => /month/i.test(h));
        const sy = Number(req.body.startYear);
        const ey = Number(req.body.endYear);
        finalRows = [];
        for (let y = sy; y <= ey; y++) {
          const months = monthField ? Array.from({ length: 12 }, (_, i) => i + 1) : [null];
          for (const mo of months) {
            for (const r of rows) {
              const copy = { ...r };
              copy[yearField] = y;
              if (monthField && mo !== null) copy[monthField] = mo;
              finalRows.push(copy);
            }
          }
        }
      }
    }
    if (req.body.populateRange === 'true') {
      finalRows = finalRows.filter(
        (r) => !Object.values(r).some((v) => v === 0 || v === null)
      );
    }
    if (!cleanTable) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const dbIdCol = cleanIdCol ? 'id' : null;
    const dbNameCol = cleanNameCol ? 'name' : null;
    let defs = [];
    if (cleanIdCol) {
      defs.push(`\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (cleanNameCol) {
      let def = `\`${dbNameCol}\` ${columnTypes[cleanNameCol] || 'VARCHAR(255)'} NOT NULL`;
      if (defaultValues[cleanNameCol]) {
        def += ` DEFAULT ${pool.escape(defaultValues[cleanNameCol])}`;
      }
      defs.push(def);
    }
    const cleanUniqueOnly = cleanUnique.filter(
      (c) =>
        c !== cleanIdCol &&
        c !== cleanNameCol &&
        !cleanExtra.includes(c) &&
        !cleanExtraFields.includes(c)
    );
    const cleanExtraFiltered = cleanExtra.filter(
      (c) => c !== cleanIdCol && c !== cleanNameCol && !cleanUniqueOnly.includes(c)
    );
    const cleanExtraFieldsFiltered = cleanExtraFields.filter(
      (c) => c !== cleanIdCol && c !== cleanNameCol && !cleanUniqueOnly.includes(c)
    );
    cleanUniqueOnly.forEach((c) => {
      let def = `\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'} NOT NULL`;
      if (defaultValues[c]) {
        def += ` DEFAULT ${pool.escape(defaultValues[c])}`;
      }
      defs.push(def);
    });
    cleanExtraFiltered.forEach((c) => {
      let def = `\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'}`;
      if (notNullMap[c]) def += ' NOT NULL';
      if (defaultValues[c]) {
        def += ` DEFAULT ${pool.escape(defaultValues[c])}`;
      }
      defs.push(def);
    });
    cleanExtraFieldsFiltered.forEach((c) => {
      let def = `\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'}`;
      if (notNullMap[c]) def += ' NOT NULL';
      if (defaultValues[c]) {
        def += ` DEFAULT ${pool.escape(defaultValues[c])}`;
      }
      defs.push(def);
    });
    calcDefs.forEach((cf) => {
      defs.push(`\`${cf.name}\` INT AS (${cf.expression}) STORED`);
    });
    const uniqueKeyFields = [
      ...(cleanUnique.includes(cleanNameCol) ? [dbNameCol] : []),
      ...cleanUniqueOnly,
    ];
    if (uniqueKeyFields.length > 0) {
      const indexName = makeUniqueKeyName(uniqueKeyFields);
      defs.push(`UNIQUE KEY ${indexName} (${uniqueKeyFields.map((c) => `\`${c}\``).join(', ')})`);
    }
    const autoOpt = cleanIdCol ? ` AUTO_INCREMENT=${autoIncStart}` : '';
    const createSql = `CREATE TABLE IF NOT EXISTS \`${cleanTable}\` (
        ${defs.join(',\n        ')}
      )${autoOpt}`;
    await pool.query(createSql);
    for (const [col, label] of Object.entries(headerMap)) {
      if (label) await setTableColumnLabel(cleanTable, cleanIdentifier(col), label);
    }
    let count = 0;
    const errors = [];
    let rowIndex = 0;
    for (const r of finalRows) {
      rowIndex++;
      const cols = [];
      const placeholders = [];
      const values = [];
      const updates = [];
      let hasData = false;
      if (cleanNameCol) {
        const nameVal = r[cleanNameCol];
        if (
          nameVal === undefined ||
          nameVal === null ||
          nameVal === '' ||
          (typeof nameVal === 'string' && nameVal.trim() === '')
        )
          continue;
        cols.push(`\`${dbNameCol}\``);
        placeholders.push('?');
        updates.push(`\`${dbNameCol}\` = VALUES(\`${dbNameCol}\`)`);
        let val = normalizeExcelError(nameVal, columnTypes[cleanNameCol]);
        val = normalizeSpecialChars(val, columnTypes[cleanNameCol]);
        if (columnTypes[cleanNameCol] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        val = normalizeNumeric(val, columnTypes[cleanNameCol]);
        val = sanitizeValue(val);
        values.push(val);
        hasData = true;
      }
      for (const c of cleanUniqueOnly) {
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = normalizeExcelError(r[c], columnTypes[c]);
        val = normalizeSpecialChars(val, columnTypes[c]);
        const blank =
          val === undefined ||
          val === null ||
          val === '' ||
          (typeof val === 'string' && val.trim() === '') ||
          val === 0;
        if (blank) {
          val =
            defaultValues[c] !== undefined && defaultValues[c] !== ''
              ? defaultValues[c]
              : defaultValForType(columnTypes[c]);
        } else if (columnTypes[c] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        val = normalizeNumeric(val, columnTypes[c]);
        val = sanitizeValue(val);
        values.push(val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
        hasData = true;
      }
      for (const c of cleanExtraFiltered) {
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = normalizeExcelError(r[c], columnTypes[c]);
        val = normalizeSpecialChars(val, columnTypes[c]);
        const blank =
          val === undefined ||
          val === null ||
          val === '' ||
          (typeof val === 'string' && val.trim() === '') ||
          val === 0;
        if (blank) {
          if (defaultValues[c] !== undefined && defaultValues[c] !== '') {
            val = defaultValues[c];
          } else if (notNullMap[c]) {
            val = defaultValForType(columnTypes[c]);
          } else {
            val = null;
          }
        } else if (columnTypes[c] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        if (val !== undefined && val !== null && val !== '' && val !== 0)
          hasData = true;
        val = normalizeNumeric(val, columnTypes[c]);
        val = sanitizeValue(val);
        values.push(val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
      }
      for (const c of cleanExtraFieldsFiltered) {
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = normalizeExcelError(r[c], columnTypes[c]);
        val = normalizeSpecialChars(val, columnTypes[c]);
        const blank =
          val === undefined ||
          val === null ||
          val === '' ||
          (typeof val === 'string' && val.trim() === '') ||
          val === 0;
        if (blank) {
          if (defaultValues[c] !== undefined && defaultValues[c] !== '') {
            val = defaultValues[c];
          } else if (notNullMap[c]) {
            val = defaultValForType(columnTypes[c]);
          } else {
            val = null;
          }
        } else if (columnTypes[c] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        if (val !== undefined && val !== null && val !== '' && val !== 0)
          hasData = true;
        val = normalizeNumeric(val, columnTypes[c]);
        val = sanitizeValue(val);
        values.push(val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
      }
      if (!hasData) continue;
      if (req.body.populateRange === 'true' && values.some((v) => v === 0 || v === null))
        continue;
      try {
        await pool.query(
          `INSERT INTO \`${cleanTable}\` (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
          values
        );
        count++;
      } catch (err) {
        errors.push({ row: rowIndex, data: r, message: err.message });
      }
    }
    fs.unlinkSync(req.file.path);
    res.json({ inserted: count, errors });
  } catch (err) {
    next(err);
  }
}
