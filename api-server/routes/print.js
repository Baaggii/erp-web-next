import express from 'express';
import { sendPrintJob } from '../controllers/printerController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.post('/', requireAuth, sendPrintJob);
export default router;
