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
router.post('/', requireAuth, assignCompany);
router.delete('/', requireAuth, removeAssignment);
router.put('/', requireAuth, updateAssignment);
export default router;
