import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listActivityLogs, restoreLogEntry } from '../controllers/activityLogController.js';

const router = express.Router();

router.get('/', requireAuth, listActivityLogs);
router.post('/:id/restore', requireAuth, restoreLogEntry);

export default router;
