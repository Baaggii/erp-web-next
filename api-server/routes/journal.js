import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { post_single_transaction, preview_single_transaction } from '../services/journalPostingEngine.js';
import { validateJournalRequestBody } from '../services/journalRouteValidation.js';

const router = express.Router();


export function mapJournalErrorToStatus(error) {
  const message = String(error?.message || error || 'Unknown journal error');
  const businessPatterns = [
    'Transaction not found',
    'missing TransType',
    'No fin_flag_set_code configured',
    'No matching fin_journal_rule',
    'has no journal lines',
    'Journal imbalance detected',
    'FS_NON_FINANCIAL',
    'Invalid source_table',
    'source_id must be a positive integer',
  ];
  const isBusiness = businessPatterns.some((pattern) => message.includes(pattern));
  return {
    status: isBusiness ? 400 : 500,
    message,
  };
}

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
    const mapped = mapJournalErrorToStatus(err);
    if (mapped.status < 500) {
      return res.status(mapped.status).json({ ok: false, message: mapped.message });
    }
    return next(err);
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
    const mapped = mapJournalErrorToStatus(err);
    if (mapped.status < 500) {
      return res.status(mapped.status).json({ ok: false, message: mapped.message });
    }
    return next(err);
  }
});

export default router;
