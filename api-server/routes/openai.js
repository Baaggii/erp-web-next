import express from 'express';
import multer from 'multer';
import {
  getResponse,
  getResponseWithFile,
  validateTranslation,
  selectTranslationModel,
  selectValidationModel,
} from '../utils/openaiClient.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

function resolveModelHint({ requested, task, lang }) {
  if (requested && typeof requested === 'string' && requested.trim()) {
    return requested.trim();
  }
  if (task === 'translation') {
    return selectTranslationModel(lang);
  }
  if (task === 'validation') {
    return selectValidationModel();
  }
  return null;
}

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { prompt, model: requestedModel, task, lang } = req.body || {};
    let response;
    if (req.file) {
      response = await getResponseWithFile(
        prompt,
        req.file.buffer,
        req.file.mimetype
      );
    } else {
      const modelHint = resolveModelHint({
        requested: requestedModel,
        task,
        lang,
      });
      response = await getResponse(prompt, {
        model: modelHint || undefined,
      });
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
