import express from 'express';
import { listNotifications, markNotificationsRead } from '../controllers/notificationsController.js';

const router = express.Router();

router.get('/', listNotifications);
router.post('/read', markNotificationsRead);

export default router;
