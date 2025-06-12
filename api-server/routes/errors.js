import express from 'express';
import { listErrorLog } from '../controllers/errorLogController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listErrorLog);
export default router;
