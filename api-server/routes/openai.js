import express from 'express';
import multer from 'multer';
import { getResponse, getResponseWithFile } from '../utils/openaiClient.js';

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

export default router;
