import express from 'express';
import {
  listAssignments,
  assignCompany,
  removeAssignment,
  updateAssignment
} from '../controllers/userCompanyController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listAssignments);
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'user_companies';
    const { empid, companyId } = req.body || {};
    if (empid && companyId) {
      res.locals.logRecordId = `${empid}-${companyId}`;
    }
    next();
  },
  assignCompany,
);
router.delete(
  '/',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'user_companies';
    const { empid, companyId } = req.body || {};
    if (empid && companyId) {
      res.locals.logRecordId = `${empid}-${companyId}`;
    }
    next();
  },
  removeAssignment,
);
router.put(
  '/',
  requireAuth,
  (req, res, next) => {
    res.locals.logTable = 'user_companies';
    const { empid, companyId } = req.body || {};
    if (empid && companyId) {
      res.locals.logRecordId = `${empid}-${companyId}`;
    }
    next();
  },
  updateAssignment,
);
export default router;
