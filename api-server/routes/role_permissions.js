import express from 'express';
import { listPermissions, updatePermission } from '../controllers/rolePermissionController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listPermissions);
router.put('/', requireAuth, updatePermission);
export default router;
