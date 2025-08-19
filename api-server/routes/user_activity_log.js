import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { restoreLogEntry } from '../controllers/activityLogController.js';

const router = express.Router();

router.post('/:id/restore', requireAuth, restoreLogEntry);

export default router;
