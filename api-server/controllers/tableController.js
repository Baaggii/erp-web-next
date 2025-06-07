import { listDatabaseTables, listTableRows, updateTableRow } from '../../db/index.js';

export async function getTables(req, res, next) {
  try {
    const tables = await listDatabaseTables();
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

export async function getTableRows(req, res, next) {
  try {
    const rows = await listTableRows(req.params.table);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function updateRow(req, res, next) {
  try {
    await updateTableRow(req.params.table, req.params.id, req.body);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
