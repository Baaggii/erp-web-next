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
  exportDefaults,
  seedExistingCompanies,
  seedCompany,
  insertDefaultTenantRow,
  updateDefaultTenantRow,
  deleteDefaultTenantRow,
} from '../controllers/tenantTablesController.js';

const router = express.Router();

router.get('/', requireAuth, listTenantTables);
router.post('/', requireAuth, createTenantTable);
router.put('/:table_name', requireAuth, updateTenantTable);
router.get('/options', requireAuth, listTenantTableOptions);
router.get('/:table_name', requireAuth, getTenantTable);
router.post('/zero-keys', requireAuth, resetSharedTenantKeys);
router.post('/seed-defaults', requireAuth, seedDefaults);
router.post('/export-defaults', requireAuth, exportDefaults);
router.post('/seed-companies', requireAuth, seedExistingCompanies);
router.post('/seed-company', requireAuth, seedCompany);
router.post('/:table_name/default-rows', requireAuth, insertDefaultTenantRow);
router.put(
  '/:table_name/default-rows/:row_id',
  requireAuth,
  updateDefaultTenantRow,
);
router.delete(
  '/:table_name/default-rows/:row_id',
  requireAuth,
  deleteDefaultTenantRow,
);

export default router;
