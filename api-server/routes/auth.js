import express from 'express';
import { login, logout, getProfile, changePassword, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';
import { createAuthAttemptLimiter } from './authLimiter.js';

const router = express.Router();
const authAttemptLimiter = createAuthAttemptLimiter();

router.post('/login', authAttemptLimiter, login);
router.post('/logout', logout);
router.post('/refresh', authAttemptLimiter, refresh);
router.get('/health', (req, res) => res.json({ status: 'ok' }));
// comment out the middleware
router.get('/me', requireAuth, getProfile);
router.post('/change-password', requireAuth, changePassword);

export default router;
