import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middlewares/auth.js';
import { getResponse, getResponseWithFile } from '../utils/openaiClient.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_000_000 },
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many requests, please try again later.',
});

const router = express.Router();

router.post('/', requireAuth, limiter, upload.single('file'), async (req, res, next) => {
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

export default router;
