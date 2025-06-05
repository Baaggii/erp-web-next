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
    const empid = req.query.empid;
    const assignments = empid
      : await listAllUserCompanies();
    res.json(assignments);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    const { empid, companyId, role } = req.body;
    await assignCompanyToUser(empid, companyId, role);
    res.sendStatus(201);
  } catch (err) {
    next(err);
  }
}

export async function updateAssignment(req, res, next) {
  try {
    const { empid, companyId, role } = req.body;
    await updateCompanyAssignment(empid, companyId, role);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function removeAssignment(req, res, next) {
  try {
    const { empid, companyId } = req.body;
    await removeCompanyAssignment(empid, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
