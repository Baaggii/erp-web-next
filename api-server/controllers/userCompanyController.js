import {
  listUserCompanies,
  assignCompanyToUser,
  removeCompanyAssignment
} from '../../../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

export async function listAssignments(req, res, next) {
  try {
    const assignments = await listUserCompanies(req.user.id);
    res.json(assignments);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    const { userId, companyId, role } = req.body;
    await assignCompanyToUser(userId, companyId, role, req.user.id);
    res.sendStatus(201);
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
