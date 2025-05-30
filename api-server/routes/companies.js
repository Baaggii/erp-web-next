import express from 'express';
import { listCompaniesHandler } from '../controllers/companyController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listCompaniesHandler);
export default router;
