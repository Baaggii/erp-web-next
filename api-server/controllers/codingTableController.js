import fs from 'fs';
import xlsx from 'xlsx';
import { pool } from '../../db/index.js';

export async function uploadCodingTable(req, res, next) {
  try {
    const {
      sheet,
      tableName,
      idColumn,
      idColumns,
      nameColumn,
      headerRow,
      otherColumns,
      autoIncrementField,
      uniqueFields,
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
    const uniqueCols = uniqueFields ? JSON.parse(uniqueFields) : [];
    const idCols = idColumns ? JSON.parse(idColumns) : idColumn ? [idColumn] : [];
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
    const headers = data[headerIndex - 1];
    if (!headers) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Header row not found' });
    }
    const rows = data.slice(headerIndex).map((row) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx];
      });
      return obj;
    });
    const valuesByHeader = {};
    headers.forEach((h) => {
      valuesByHeader[h] = rows.map((r) => r[h]);
    });
    function detectType(name, vals) {
      if (name.toLowerCase().includes('date')) return 'DATE';
      for (const v of vals) {
        if (v === undefined || v === '') continue;
        if (!isNaN(Date.parse(v))) return 'DATE';
        const n = Number(v);
        if (!Number.isNaN(n)) {
          if (String(v).includes('.')) return 'DECIMAL(10,2)';
          return 'INT';
        }
        break;
      }
      return 'VARCHAR(255)';
    }
    const columnTypes = {};
    headers.forEach((h) => {
      columnTypes[h] = detectType(h, valuesByHeader[h]);
    });
    if (!tableName || idCols.length === 0 || !nameColumn) {
      return res.status(400).json({ error: 'Missing params' });
    }
    let createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255)`;
    extraCols.forEach((c) => {
      let def = `\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'}`;
      if (c === autoIncrementField) def += ' AUTO_INCREMENT';
      createSql += `,
        ${def}`;
    });
    if (autoIncrementField && !extraCols.includes(autoIncrementField) && headers.includes(autoIncrementField)) {
      createSql += `,
        \`${autoIncrementField}\` INT AUTO_INCREMENT`;
    }
    if (uniqueCols.length > 0) {
      createSql += `,
        UNIQUE KEY uniq_${uniqueCols.join('_')} (${uniqueCols.map((c) => `\`${c}\``).join(', ')})`;
    }
    createSql += `
      )`;
    await pool.query(createSql);
    let count = 0;
    for (const r of rows) {
      const idVals = idCols.map((c) => r[c]);
      const id = idVals.join('-');
      const name = r[nameColumn];
      if (idVals.some((v) => v === undefined) || name === undefined) continue;
      const cols = ['id', 'name'];
      const placeholders = ['?', '?'];
      const values = [String(id), String(name)];
      const updates = ['name = VALUES(name)'];
      extraCols.forEach((c) => {
        if (c === autoIncrementField) return;
        cols.push(`\`${c}\``);
        placeholders.push('?');
        let val = r[c];
        if (columnTypes[c] === 'DATE') {
          const d = new Date(val);
          val = Number.isNaN(d.getTime()) ? null : d;
        }
        values.push(val === undefined ? null : val);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
      });
      if (autoIncrementField) {
        cols.push(`\`${autoIncrementField}\``);
        placeholders.push('DEFAULT');
      }
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
