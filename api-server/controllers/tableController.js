import {
  listDatabaseTables,
  listTableRows,
  listTableRelations,
  listTableColumns,
  updateTableRow,
  insertTableRow,
  deleteTableRow,
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
    const rowsPerPage = Math.min(Number(perPage) || 50, 500);
    const result = await listTableRows(req.params.table, {
      page: Number(page) || 1,
      perPage: rowsPerPage,
      filters,
      sort: { column: sort, dir },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTableRelations(req, res, next) {
  try {
    const relations = await listTableRelations(req.params.table);
    res.json(relations);
  } catch (err) {
    next(err);
  }
}

export async function getTableColumns(req, res, next) {
  try {
    const cols = await listTableColumns(req.params.table);
    res.json(cols);
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

export async function deleteRow(req, res, next) {
  try {
    await deleteTableRow(req.params.table, req.params.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
