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
    } = req.body;
    const extraCols = otherColumns ? JSON.parse(otherColumns) : [];
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
    if (!tableName || idCols.length === 0 || !nameColumn) {
      return res.status(400).json({ error: 'Missing params' });
    }
    let createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255)`;
    extraCols.forEach((c) => {
      createSql += `,
        \`${c}\` VARCHAR(255)`;
    });
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
        cols.push(`\`${c}\``);
        placeholders.push('?');
        values.push(r[c] === undefined ? '' : String(r[c]));
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
