import express from 'express';
import { listCompanies } from '../controllers/companyController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.get('/', requireAuth, listCompanies);
export default router;