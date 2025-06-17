import express from 'express';
import { getMappings, addMappings } from '../services/headerMappings.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const headers = req.query.headers ? req.query.headers.split(',') : [];
    const map = await getMappings(headers);
    res.json(map);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const mappings = req.body.mappings || {};
    await addMappings(mappings);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
