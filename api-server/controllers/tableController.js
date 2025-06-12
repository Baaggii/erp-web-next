import {
  listDatabaseTables,
  listTableRows,
  updateTableRow,
  insertTableRow,
  deleteTableRow,
  listTableRelationships,
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
    const rels = await listTableRelationships(req.params.table);
    res.json(rels);
  } catch (err) {
    next(err);
  }
}

export async function updateRow(req, res, next) {
  try {
    const updates = { ...req.body };
    delete updates.created_by;
    delete updates.created_at;
    await updateTableRow(req.params.table, req.params.id, updates);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function addRow(req, res, next) {
  try {
    const row = {
      ...req.body,
      created_by: req.user?.empid,
      created_at: new Date(),
    };
    const result = await insertTableRow(req.params.table, row);
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
