import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getTables,
  getTableRows,
  getTableRelations,
  resolveTableRelationRows,
  listCustomTableRelations,
  saveCustomTableRelation,
  deleteCustomTableRelation,
  getTableColumnsMeta,
  saveColumnLabels,
  updateRow,
  addRow,
  deleteRow,
  getRowReferences,
  getTableRow,
} from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

const tablesRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window for table routes
});

router.use(tablesRateLimiter);

router.get('/', requireAuth, getTables);
// More specific routes must be defined before the generic ':table' pattern
router.get('/:table/relations/custom', requireAuth, listCustomTableRelations);
router.put(
  '/:table/relations/custom/:column',
  requireAuth,
  saveCustomTableRelation,
);
router.delete(
  '/:table/relations/custom/:column',
  requireAuth,
  deleteCustomTableRelation,
);
router.get('/:table/relations', requireAuth, getTableRelations);
router.post('/:table/relations/resolve', requireAuth, resolveTableRelationRows);
router.get('/:table/columns', requireAuth, getTableColumnsMeta);
router.put('/:table/labels', requireAuth, saveColumnLabels);
router.get('/:table/:id/references', requireAuth, getRowReferences);
router.get('/:table/:id', requireAuth, getTableRow);
router.put('/:table/:id', requireAuth, updateRow);
router.delete('/:table/:id', requireAuth, deleteRow);
router.post('/:table', requireAuth, addRow);
router.get('/:table', requireAuth, getTableRows);

export default router;
