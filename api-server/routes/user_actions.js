import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getUserActions } from '../controllers/rolePermissionController.js';

const router = express.Router();

router.get('/user_actions', requireAuth, getUserActions);

export default router;
