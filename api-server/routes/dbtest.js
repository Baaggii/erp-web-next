import express from 'express';
import { testDb } from '../controllers/dbTestController.js';
const router = express.Router();
router.get('/', testDb);
export default router;
