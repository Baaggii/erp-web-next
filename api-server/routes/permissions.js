import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listGroups, getActions, updateActions } from '../controllers/permissionsController.js';

const router = express.Router();

router.get('/actions', requireAuth, listGroups);
router.get('/actions/:userLevelId', requireAuth, getActions);
router.put('/actions/:userLevelId', requireAuth, updateActions);

export default router;
