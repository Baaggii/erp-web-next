import express from 'express';
import {
  listAssignments,
  assignCompany,
  removeAssignment,
  updateAssignment
} from '../controllers/userCompanyController.js';
import { requireAuth } from '../middlewares/auth.js';
import { setUserCompanyLogId } from './logRecordId.js';

const router = express.Router();
router.get('/', requireAuth, listAssignments);
router.post('/', requireAuth, setUserCompanyLogId, assignCompany);
router.delete('/', requireAuth, setUserCompanyLogId, removeAssignment);
router.put('/', requireAuth, setUserCompanyLogId, updateAssignment);
export default router;
