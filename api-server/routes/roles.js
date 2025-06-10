import express from 'express';
import { listRoles } from '../controllers/roleController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listRoles);
export default router;
