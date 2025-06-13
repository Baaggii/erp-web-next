import fs from 'fs';
let xlsx;
try {
  const mod = await import('xlsx');
  xlsx = mod.default || mod;
} catch {
  xlsx = { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [] } };
}
import { pool } from '../../db/index.js';

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

export function detectType(name, vals) {
  const lower = String(name).toLowerCase();
  if (lower.includes('_per')) return 'DECIMAL(5,2)';
  if (lower.includes('date')) return 'DATE';
  for (const v of vals) {
    if (v === undefined || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) {
      const str = String(v);
      const digits = str.replace(/[-.]/g, '');
      if (digits.length > 8) return 'VARCHAR(255)';
      if (str.includes('.')) return 'DECIMAL(10,2)';
      return 'INT';
    }
    break;
  }
  return 'VARCHAR(255)';
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
      uniqueFields,
      calcFields,
      columnTypes: columnTypesJson,
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
    const uniqueCols = uniqueFields ? JSON.parse(uniqueFields) : [];
    const calcDefs = calcFields ? JSON.parse(calcFields) : [];
    const columnTypeOverride = columnTypesJson ? JSON.parse(columnTypesJson) : {};
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
      if (String(h).length > 1) {
        headers.push(h);
        keepIdx.push(idx);
      }
    });
    if (headers.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Header row not found' });
    }
    const uniqueOnly = uniqueCols.filter(
      (c) => c !== idColumn && c !== nameColumn && !extraCols.includes(c)
    );
    const extraFiltered = extraCols.filter(
      (c) => c !== idColumn && c !== nameColumn && !uniqueOnly.includes(c)
    );
    if (!idColumn && !nameColumn && uniqueOnly.length === 0 && extraFiltered.length === 0) {
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
    const valuesByHeader = {};
    headers.forEach((h) => {
      valuesByHeader[h] = rows.map((r) => r[h]);
    });
    const columnTypes = {};
    const notNullMap = {};
    headers.forEach((h) => {
      columnTypes[h] = detectType(h, valuesByHeader[h]);
      notNullMap[h] = valuesByHeader[h].every(
        (v) => v !== undefined && v !== null && v !== ''
      );
    });
    for (const [col, typ] of Object.entries(columnTypeOverride)) {
      columnTypes[col] = typ;
    }
    if (!tableName) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const dbIdCol = idColumn ? 'id' : null;
    const dbNameCol = nameColumn ? 'name' : null;
    let defs = [];
    if (idColumn) {
      defs.push(`\`${dbIdCol}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nameColumn) {
      defs.push(
        `\`${dbNameCol}\` ${
          columnTypes[nameColumn] || 'VARCHAR(255)'
        } NOT NULL`
      );
    }
    uniqueOnly.forEach((c) => {
      defs.push(`\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'} NOT NULL`);
    });
    extraFiltered.forEach((c) => {
      let def = `\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'}`;
      if (notNullMap[c]) def += ' NOT NULL';
      defs.push(def);
    });
    calcDefs.forEach((cf) => {
      defs.push(`\`${cf.name}\` INT AS (${cf.expression}) STORED`);
    });
    const uniqueKeyFields = [
      ...(uniqueCols.includes(nameColumn) ? [dbNameCol] : []),
      ...uniqueOnly,
    ];
    if (uniqueKeyFields.length > 0) {
      defs.push(`UNIQUE KEY uniq_${uniqueKeyFields.join('_')} (${uniqueKeyFields.map((c) => `\`${c}\``).join(', ')})`);
    }
    const createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        ${defs.join(',\n        ')}
      )`;
    await pool.query(createSql);
    let count = 0;
    for (const r of rows) {
      const cols = [];
      const placeholders = [];
      const values = [];
      const updates = [];
      let hasData = false;
      if (nameColumn) {
        const nameVal = r[nameColumn];
        if (nameVal === undefined || nameVal === null || nameVal === '') continue;
        cols.push(`\`${dbNameCol}\``);
        placeholders.push('?');
        updates.push(`\`${dbNameCol}\` = VALUES(\`${dbNameCol}\`)`);
        let val = nameVal;
        if (columnTypes[nameColumn] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        values.push(val);
        hasData = true;
      }
      let skip = false;
      for (const c of uniqueOnly) {
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = r[c];
        const hasProp = Object.prototype.hasOwnProperty.call(r, c);
        if (columnTypes[c] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        if (hasProp && (val === undefined || val === null || val === '')) {
          skip = true;
          break;
        }
        values.push(val === undefined ? null : val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
        if (val !== undefined && val !== null && val !== '') hasData = true;
      }
      if (skip) continue;
      for (const c of extraFiltered) {
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = r[c];
        if (columnTypes[c] === 'DATE') {
          const d = parseExcelDate(val);
          val = d || null;
        }
        if (val !== undefined && val !== null && val !== '') hasData = true;
        values.push(val === undefined || val === '' ? null : val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
      }
      if (!hasData) continue;
      await pool.query(
        `INSERT INTO \`${tableName}\` (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
        values
      );
      count++;
    }
    fs.unlinkSync(req.file.path);
    res.json({ inserted: count });
  } catch (err) {
    next(err);
  }
}
