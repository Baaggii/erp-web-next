import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listTables,
  listColumns,
  convertColumns,
  listScripts,
  runScript,
} from '../controllers/jsonConversionController.js';

const router = express.Router();

router.get('/tables', requireAuth, listTables);
router.get('/tables/:table/columns', requireAuth, listColumns);
router.post('/convert', requireAuth, convertColumns);
router.get('/scripts', requireAuth, listScripts);
router.post('/scripts/:id/run', requireAuth, runScript);

export default router;
