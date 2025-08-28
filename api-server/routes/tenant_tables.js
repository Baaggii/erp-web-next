import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listTenantTables,
  createTenantTable,
  updateTenantTable,
  listTenantTableOptions,
} from '../controllers/tenantTablesController.js';

const router = express.Router();

router.get('/', requireAuth, listTenantTables);
router.post('/', requireAuth, createTenantTable);
router.put('/:table_name', requireAuth, updateTenantTable);
router.get('/options', requireAuth, listTenantTableOptions);

export default router;
