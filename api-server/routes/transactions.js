import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getInventoryTransactions } from '../controllers/transactionController.js';

const router = express.Router();

router.get('/', requireAuth, getInventoryTransactions);

export default router;
