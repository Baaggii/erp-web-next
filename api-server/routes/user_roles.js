import express from 'express';
import { listUserRoles } from '../controllers/userRoleController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listUserRoles);
export default router;
