import fs from 'fs';
import xlsx from 'xlsx';
import { pool } from '../../db/index.js';

export async function uploadCodingTable(req, res, next) {
  try {
    const { sheet, tableName, idColumn, nameColumn, headerRow } = req.body;
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
    if (!tableName || !idColumn || !nameColumn) {
      return res.status(400).json({ error: 'Missing params' });
    }
    await pool.query(
      `CREATE TABLE IF NOT EXISTS \`${tableName}\` (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255)
      )`
    );
    let count = 0;
    for (const r of rows) {
      const id = r[idColumn];
      const name = r[nameColumn];
      if (id === undefined || name === undefined) continue;
      await pool.query(
        `INSERT INTO \`${tableName}\` (id, name)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [String(id), String(name)]
      );
      count++;
    }
    fs.unlinkSync(req.file.path);
    res.json({ inserted: count });
  } catch (err) {
    next(err);
  }
}
