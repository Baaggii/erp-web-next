import {
  listDatabaseTables,
  listTableRows,
  updateTableRow,
  insertTableRow,
} from '../../db/index.js';

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
    const { page, perPage, sort, dir, ...filters } = req.query;
    const result = await listTableRows(req.params.table, {
      page: Number(page) || 1,
      perPage: Number(perPage) || 50,
      filters,
      sort: { column: sort, dir },
    });
    res.json(result);
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

export async function addRow(req, res, next) {
  try {
    const result = await insertTableRow(req.params.table, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
