import express from 'express';
import { login, logout, getProfile, changePassword } from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';
const router = express.Router();
router.post('/login', login);
router.post('/logout', logout);
router.get('/health', (req, res) => res.json({ status: 'ok' }));
// comment out the middleware
router.get('/me', requireAuth, getProfile);
router.post('/change-password', requireAuth, changePassword);
export default router;
