import express from 'express';
import {
  getTables,
  getTableRows,
  updateRow,
  addRow,
  deleteRow,
  getRelations,
} from '../controllers/tableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, getTables);
router.get('/:table/relations', requireAuth, getRelations);
router.get('/:table', requireAuth, getTableRows);
router.put('/:table/:id', requireAuth, updateRow);
router.post('/:table', requireAuth, addRow);
router.delete('/:table/:id', requireAuth, deleteRow);

export default router;
