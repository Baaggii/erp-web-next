import fs from 'fs';
import xlsx from 'xlsx';
import { pool } from '../../db/index.js';

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
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
    const uniqueCols = uniqueFields ? JSON.parse(uniqueFields) : [];
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
    if (!tableName) {
      return res.status(400).json({ error: 'Missing params' });
    }
    let defs = [];
    if (idColumn) {
      defs.push(`\`${idColumn}\` INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (nameColumn) {
      defs.push(`\`${nameColumn}\` ${columnTypes[nameColumn] || 'VARCHAR(255)'}`);
    }
    extraCols.forEach((c) => {
      defs.push(`\`${c}\` ${columnTypes[c] || 'VARCHAR(255)'}`);
    });
    if (uniqueCols.length > 0) {
      defs.push(`UNIQUE KEY uniq_${uniqueCols.join('_')} (${uniqueCols.map((c) => `\`${c}\``).join(', ')})`);
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
      if (nameColumn) {
        const nameVal = r[nameColumn];
        cols.push(`\`${nameColumn}\``);
        placeholders.push('?');
        updates.push(`\`${nameColumn}\` = VALUES(\`${nameColumn}\`)`);
        let val = nameVal;
        if (columnTypes[nameColumn] === 'DATE') {
          const d = new Date(val);
          val = Number.isNaN(d.getTime()) ? null : d;
        }
        values.push(val === undefined ? null : val);
      }
      extraCols.forEach((c) => {
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
      if (cols.length === 0) continue;
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
