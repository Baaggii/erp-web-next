import {
  listUserCompanies,
  assignCompanyToUser,
  removeCompanyAssignment,
  updateCompanyAssignment,
  listAllUserCompanies,
  listCompanies,
  getEmploymentSession,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

export async function listAssignments(req, res, next) {
  try {
    const empid = req.query.empid;
    const companyId = req.query.companyId || req.user.companyId;

    if (
      req.query.companyId &&
      Number(req.query.companyId) !== Number(req.user.companyId)
    ) {
      const session = await getEmploymentSession(
        req.user.empid,
        req.user.companyId,
      );
      if (!(await hasAction(session, 'system_settings'))) {
        return res.sendStatus(403);
      }
    }

    if (!empid) {
      const companies = await listCompanies(req.user.empid);
      if (!companies.some((c) => c.id === Number(companyId))) {
        return res.sendStatus(403);
      }
    }

    let assignments;
    if (empid) {
      assignments = await listUserCompanies(empid);
    } else {
      assignments = await listAllUserCompanies(companyId, req.user.empid);
    }
    res.json(assignments);
  } catch (err) {
    next(err);
  }
}

export async function assignCompany(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, 'system_settings'))) {
      return res.sendStatus(403);
    }
    const { empid, companyId, positionId, branchId } = req.body;
    const companies = await listCompanies(req.user.empid);
    if (!companies.some((c) => c.id === Number(companyId))) {
      return res.sendStatus(403);
    }
    await assignCompanyToUser(
      empid,
      companyId,
      positionId,
      branchId,
      req.user.empid,
    );
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
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, 'system_settings'))) {
      return res.sendStatus(403);
    }
    const { empid, companyId, positionId, branchId } = req.body;
    const companies = await listCompanies(req.user.empid);
    if (!companies.some((c) => c.id === Number(companyId))) {
      return res.sendStatus(403);
    }
    await updateCompanyAssignment(
      empid,
      companyId,
      positionId,
      branchId,
    );
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function removeAssignment(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, 'system_settings'))) {
      return res.sendStatus(403);
    }
    const { empid, companyId } = req.body;
    const companies = await listCompanies(req.user.empid);
    if (!companies.some((c) => c.id === Number(companyId))) {
      return res.sendStatus(403);
    }
    await removeCompanyAssignment(empid, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
