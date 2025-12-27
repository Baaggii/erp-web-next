import express from 'express';
import { getTableMeta } from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTableMeta);

export default router;
