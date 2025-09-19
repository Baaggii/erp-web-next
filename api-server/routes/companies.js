import express from 'express';
import {
  listCompaniesHandler,
  createCompanyHandler,
  updateCompanyHandler,
  deleteCompanyHandler,
  listCompanyBackupsHandler,
  restoreCompanyBackupHandler,
} from '../controllers/companyController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, listCompaniesHandler);
router.get('/backups', requireAuth, listCompanyBackupsHandler);
router.post('/backups/restore', requireAuth, restoreCompanyBackupHandler);
router.post('/', requireAuth, createCompanyHandler);
router.put('/:id', requireAuth, updateCompanyHandler);
router.delete('/:id', requireAuth, deleteCompanyHandler);
export default router;
