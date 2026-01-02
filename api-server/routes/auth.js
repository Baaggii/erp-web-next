import express from 'express';
import { login, logout, getProfile, changePassword, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/health', (req, res) => res.json({ status: 'ok' }));
// comment out the middleware
router.get('/me', requireAuth, getProfile);
router.post('/change-password', requireAuth, changePassword);
export default router;
