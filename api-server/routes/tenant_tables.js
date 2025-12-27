import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
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
  listDefaultSnapshots,
  restoreDefaults,
} from '../controllers/tenantTablesController.js';

const router = express.Router();

router.get('/', requireAuth, requireAdmin, listTenantTables);
router.post('/', requireAuth, requireAdmin, createTenantTable);
router.put('/:table_name', requireAuth, requireAdmin, updateTenantTable);
router.get('/options', requireAuth, requireAdmin, listTenantTableOptions);
router.get('/default-snapshots', requireAuth, requireAdmin, listDefaultSnapshots);
router.get('/:table_name', requireAuth, requireAdmin, getTenantTable);
router.post('/zero-keys', requireAuth, requireAdmin, resetSharedTenantKeys);
router.post('/seed-defaults', requireAuth, requireAdmin, seedDefaults);
router.post('/export-defaults', requireAuth, requireAdmin, exportDefaults);
router.post('/restore-defaults', requireAuth, requireAdmin, restoreDefaults);
router.post('/seed-companies', requireAuth, requireAdmin, seedExistingCompanies);
router.post('/seed-company', requireAuth, requireAdmin, seedCompany);
router.post('/:table_name/default-rows', requireAuth, requireAdmin, insertDefaultTenantRow);
router.put(
  '/:table_name/default-rows/:row_id',
  requireAuth,
  requireAdmin,
  updateDefaultTenantRow,
);
router.delete(
  '/:table_name/default-rows/:row_id',
  requireAuth,
  requireAdmin,
  deleteDefaultTenantRow,
);

export default router;
