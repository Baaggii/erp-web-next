import express from 'express';
import { getPrinters } from '../controllers/printerController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, getPrinters);
export default router;
