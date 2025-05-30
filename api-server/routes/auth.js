import express from 'express';
import { login, logout, getProfile } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, getProfile);
export default router;