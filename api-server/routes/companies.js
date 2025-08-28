import express from 'express';
import {
  listCompaniesHandler,
  createCompanyHandler,
} from '../controllers/companyController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listCompaniesHandler);
router.post('/', requireAuth, createCompanyHandler);
export default router;
