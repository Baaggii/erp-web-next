import express from 'express';
import { getUserSettingsHandler, updateUserSettingsHandler } from '../controllers/userSettingsController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
router.get('/', requireAuth, getUserSettingsHandler);
router.put('/', requireAuth, updateUserSettingsHandler);
export default router;
