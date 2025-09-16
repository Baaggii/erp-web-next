import express from 'express';
import { getTriggerColumns } from '../controllers/triggerColumnController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTriggerColumns);

export default router;
