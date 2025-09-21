import express from 'express';
import multer from 'multer';
import {
  getResponse,
  getResponseWithFile,
  validateTranslation,
} from '../utils/openaiClient.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { prompt } = req.body;
    let response;
    if (req.file) {
      response = await getResponseWithFile(
        prompt,
        req.file.buffer,
        req.file.mimetype
      );
    } else {
      response = await getResponse(prompt);
    }
    res.json({ response });
  } catch (err) {
    next(err);
  }
});

router.post('/validate', async (req, res, next) => {
  try {
    const { candidate, base, lang, metadata } = req.body || {};
    if (!candidate || !String(candidate).trim()) {
      res.json({
        valid: false,
        reason: 'empty',
        needsRetry: false,
        strategy: 'heuristic',
      });
      return;
    }
    const result = await validateTranslation({ candidate, base, lang, metadata });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
