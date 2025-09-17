import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listTenantTables,
  createTenantTable,
  updateTenantTable,
  listTenantTableOptions,
  getTenantTable,
  resetSharedTenantKeys,
  seedDefaults,
  seedExistingCompanies,
  seedCompany,
} from '../controllers/tenantTablesController.js';

const router = express.Router();

router.get('/', requireAuth, listTenantTables);
router.post('/', requireAuth, createTenantTable);
router.put('/:table_name', requireAuth, updateTenantTable);
router.get('/options', requireAuth, listTenantTableOptions);
router.get('/:table_name', requireAuth, getTenantTable);
router.post('/zero-keys', requireAuth, resetSharedTenantKeys);
router.post('/seed-defaults', requireAuth, seedDefaults);
router.post('/seed-companies', requireAuth, seedExistingCompanies);
router.post('/seed-company', requireAuth, seedCompany);

export default router;
