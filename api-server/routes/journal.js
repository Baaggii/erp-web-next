import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { post_single_transaction, preview_single_transaction } from '../services/journalPostingEngine.js';
import { validateJournalRequestBody } from '../services/journalRouteValidation.js';

const router = express.Router();

router.post('/post', requireAuth, async (req, res, next) => {
  try {
    const validation = validateJournalRequestBody(req.body, { allowForceRepost: true });
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    const payload = validation.value;
    const journalId = await post_single_transaction(payload);

    if (journalId === null) {
      return res.status(400).json({
        ok: false,
        message: 'FS_NON_FINANCIAL transactions cannot be posted',
      });
    }

    return res.json({ ok: true, journal_id: journalId });
  } catch (err) {
    next(err);
  }
});

router.post('/preview', requireAuth, async (req, res, next) => {
  try {
    const validation = validateJournalRequestBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    const preview = await preview_single_transaction(validation.value);
    return res.json({ ok: true, ...preview });
  } catch (err) {
    next(err);
  }
});

export default router;
