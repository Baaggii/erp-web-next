import express from 'express';
import {
  getTables,
  getTableRows,
  getTableRelations,
  getCustomTableRelations,
  saveTableRelation,
  deleteTableRelation,
  getTableColumnsMeta,
  saveColumnLabels,
  updateRow,
  addRow,
  deleteRow,
  getRowReferences,
} from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTables);
// More specific routes must be defined before the generic ':table' pattern
router.get('/:table/relations/custom', requireAuth, getCustomTableRelations);
router.put('/:table/relations/custom', requireAuth, saveTableRelation);
router.delete('/:table/relations/custom/:column', requireAuth, deleteTableRelation);
router.get('/:table/relations', requireAuth, getTableRelations);
router.get('/:table/columns', requireAuth, getTableColumnsMeta);
router.put('/:table/labels', requireAuth, saveColumnLabels);
router.get('/:table/:id/references', requireAuth, getRowReferences);
router.put('/:table/:id', requireAuth, updateRow);
router.delete('/:table/:id', requireAuth, deleteRow);
router.post('/:table', requireAuth, addRow);
router.get('/:table', requireAuth, getTableRows);

export default router;
