import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  fetchGeneralConfig,
  saveGeneralConfig,
} from '../controllers/generalConfigController.js';

const router = express.Router();

router.get('/', requireAuth, fetchGeneralConfig);
router.put('/', requireAuth, saveGeneralConfig);

export default router;
