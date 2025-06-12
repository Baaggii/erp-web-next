import express from 'express';
import {
  getTables,
  getTableRows,
  getTableRelations,
  getTableColumns,
  updateRow,
  addRow,
  deleteRow,
} from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTables);
router.get('/:table', requireAuth, getTableRows);
router.get('/:table/relations', requireAuth, getTableRelations);
router.get('/:table/columns', requireAuth, getTableColumns);
router.put('/:table/:id', requireAuth, updateRow);
router.post('/:table', requireAuth, addRow);
router.delete('/:table/:id', requireAuth, deleteRow);

export default router;
