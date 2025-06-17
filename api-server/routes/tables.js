import express from 'express';
import {
  getTables,
  getTableRows,
  getTableRelations,
  getTableColumnsMeta,
  getTableHeaderMap,
  updateTableHeaderMap,
  updateRow,
  addRow,
  deleteRow,
  getRowReferences,
} from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTables);
// More specific routes must be defined before the generic ':table' pattern
router.get('/:table/relations', requireAuth, getTableRelations);
router.get('/:table/columns', requireAuth, getTableColumnsMeta);
router.get('/:table/headers', requireAuth, getTableHeaderMap);
router.put('/:table/headers', requireAuth, updateTableHeaderMap);
router.get('/:table/:id/references', requireAuth, getRowReferences);
router.put('/:table/:id', requireAuth, updateRow);
router.delete('/:table/:id', requireAuth, deleteRow);
router.post('/:table', requireAuth, addRow);
router.get('/:table', requireAuth, getTableRows);

export default router;
