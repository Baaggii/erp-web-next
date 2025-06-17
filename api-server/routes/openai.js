import express from 'express';
import { getResponse } from '../utils/openaiClient.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { prompt } = req.body;
    const response = await getResponse(prompt);
    res.json({ response });
  } catch (err) {
    next(err);
  }
});

export default router;
