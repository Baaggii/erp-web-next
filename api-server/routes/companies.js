import express from 'express';
import {
  listCompaniesHandler,
  createCompanyHandler,
  updateCompanyHandler,
  deleteCompanyHandler,
} from '../controllers/companyController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listCompaniesHandler);
router.post('/', requireAuth, createCompanyHandler);
router.put('/:id', requireAuth, updateCompanyHandler);
router.delete('/:id', requireAuth, deleteCompanyHandler);
export default router;
