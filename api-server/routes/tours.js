import express from 'express';
import {
  deleteTourHandler,
  listOrGetToursHandler,
  saveTourHandler,
} from '../controllers/tourController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, listOrGetToursHandler);
router.put('/:pageKey', requireAuth, saveTourHandler);
router.delete('/:pageKey', requireAuth, deleteTourHandler);

export default router;
