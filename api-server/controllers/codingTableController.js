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
      uniqueColumns,
      dateColumns,
      columnTypes,
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
    const uniqueCols = uniqueColumns ? JSON.parse(uniqueColumns) : [];
    const dateCols = dateColumns ? JSON.parse(dateColumns) : [];
    const colTypes = columnTypes ? JSON.parse(columnTypes) : {};
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
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false, cellDates: true });
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
    if (!tableName || idCols.length === 0 || !nameColumn) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const allCols = Array.from(new Set([...idCols, nameColumn, ...extraCols]));
    let createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(255) PRIMARY KEY`;
    allCols.forEach((c) => {
      let sqlType = 'VARCHAR(255)';
      const t = colTypes[c];
      if (t === 'number') sqlType = 'INT';
      else if (t === 'date' || dateCols.includes(c)) sqlType = 'DATE';
      createSql += `,
        \`${c}\` ${sqlType}`;
    });
    if (uniqueCols.length > 0) {
      const uniqueSql = uniqueCols.map((c) => `\`${c}\``).join(', ');
      createSql += `,
        UNIQUE KEY \`uk_${tableName}\` (${uniqueSql})`;
    }
    createSql += `
      )`;
    await pool.query(createSql);
    let count = 0;
    for (const r of rows) {
      const idVals = idCols.map((c) => r[c]);
      const id = idVals.join('-');
      if (idVals.some((v) => v === undefined)) continue;
      const cols = ['id'];
      const placeholders = ['?'];
      const values = [String(id)];
      const updates = [];
      allCols.forEach((c) => {
        let v = r[c];
        const t = colTypes[c];
        if (t === 'date' || dateCols.includes(c)) {
          const d = v instanceof Date ? v : v ? new Date(v) : null;
          v = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
        }
        cols.push(`\`${c}\``);
        placeholders.push('?');
        values.push(v === undefined ? null : v);
        updates.push(`\`${c}\` = VALUES(\`${c}\`)`);
      });
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
