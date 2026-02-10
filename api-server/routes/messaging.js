import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listMessages, createMessage, listCompanyPeople } from '../services/messagingService.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const data = await listMessages({
      user: req.user,
      companyId: req.query.companyId,
      limit: req.query.limit,
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load messages' });
  }
});

router.get('/people', async (req, res) => {
  try {
    const data = await listCompanyPeople({ user: req.user, companyId: req.query.companyId });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load people' });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await createMessage({
      user: req.user,
      payload: req.body,
      companyId: req.body?.companyId ?? req.query.companyId,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to send message' });
  }
});

export default router;
