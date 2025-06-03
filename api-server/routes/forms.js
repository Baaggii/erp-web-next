import express from 'express';
import { getFormSchemas } from '../controllers/formController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.get('/', requireAuth, getFormSchemas);
export default router;
