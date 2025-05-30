import express from 'express';
import {
  getSettings,
  updateSettings
} from '../controllers/settingsController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, getSettings);
router.put('/', requireAuth, updateSettings);
export default router;