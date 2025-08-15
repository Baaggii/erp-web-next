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
    const companyId = req.query.companyId;
    let assignments;
    if (empid) {
      assignments = await listUserCompanies(empid);
    } else if (companyId) {
      assignments = await listAllUserCompanies(companyId);
    } else {
      assignments = await listAllUserCompanies();
    }
    res.json(assignments);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    if (req.user.position !== 'admin') {
      return res.sendStatus(403);
    }
    const { empid, companyId, positionId, branchId } = req.body;
    await assignCompanyToUser(empid, companyId, positionId, branchId, req.user.empid);
    res.sendStatus(201);
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ message: 'Invalid empid or companyId' });
    }
    next(err);
  }
}

export async function updateAssignment(req, res, next) {
  try {
    if (req.user.position !== 'admin') {
      return res.sendStatus(403);
    }
    const { empid, companyId, positionId, branchId } = req.body;
    await updateCompanyAssignment(empid, companyId, positionId, branchId);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function removeAssignment(req, res, next) {
  try {
    if (req.user.position !== 'admin') {
      return res.sendStatus(403);
    }
    const { empid, companyId } = req.body;
    await removeCompanyAssignment(empid, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
