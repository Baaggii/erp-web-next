import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listJsonTables,
  listJsonTableColumns,
  previewOrRunConversion,
  listConversionHistory,
  rerunSavedScript,
} from '../controllers/jsonConversionController.js';

const router = express.Router();

router.get('/tables', requireAuth, listJsonTables);
router.get('/logs', requireAuth, listConversionHistory);
router.post('/logs/:id/run', requireAuth, rerunSavedScript);
router.get('/:table/columns', requireAuth, listJsonTableColumns);
router.post('/convert', requireAuth, previewOrRunConversion);

export default router;
