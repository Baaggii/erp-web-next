import {
  fetchAssignments,
  addAssignment,
  removeAssignmentById
} from '../../db/index.js';

export async function listAssignments(req, res, next) {
  try {
    const assigns = await fetchAssignments();
    res.json(assigns);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    const result = await addAssignment(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function removeAssignment(req, res, next) {
  try {
    await removeAssignmentById(req.body.id);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}