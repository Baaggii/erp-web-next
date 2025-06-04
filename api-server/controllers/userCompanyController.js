import {
  listUserCompanies,
  assignCompanyToUser,
  removeCompanyAssignment,
  updateCompanyAssignment,
  listAllUserCompanies
} from '../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

export async function listAssignments(req, res, next) {
  try {
    const userId = req.query.userId;
    const assignments = userId
      ? await listUserCompanies(userId)
      : await listAllUserCompanies();
    res.json(assignments);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    const { userId, companyId, empid, role } = req.body;
    await assignCompanyToUser(userId, companyId, empid, role);
    res.sendStatus(201);
  } catch (err) {
    next(err);
  }
}

export async function updateAssignment(req, res, next) {
  try {
    const { userId, companyId, role } = req.body;
    await updateCompanyAssignment(userId, companyId, role);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function removeAssignment(req, res, next) {
  try {
    const { userId, companyId } = req.body;
    await removeCompanyAssignment(userId, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
