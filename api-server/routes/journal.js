import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { post_single_transaction, preview_single_transaction } from '../services/journalPostingEngine.js';
import { validateJournalRequestBody } from '../services/journalRouteValidation.js';
import { emitCanonicalEvent } from '../services/eventEmitterService.js';

const router = express.Router();

router.post('/post', requireAuth, async (req, res) => {
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

    try {
      await emitCanonicalEvent({
        eventType: 'journal.posted',
        companyId: Number(payload.company_id || req.user?.companyId || 0),
        actorEmpid: req.user?.empid ?? null,
        source: {
          transactionType: payload.transaction_type || null,
          table: payload.source_table || null,
          recordId: payload.source_id != null ? String(payload.source_id) : null,
          action: 'post',
        },
        payload: {
          journalId,
          postingRequest: payload,
        },
      });
    } catch (eventErr) {
      console.error('Journal post succeeded but event emit failed:', {
        journalId,
        error: eventErr?.message || eventErr,
      });
    }

    return res.json({ ok: true, journal_id: journalId });
  } catch (err) {
    console.error('Journal post failed:', err);
    return res.status(500).json({
      ok: false,
      message: err?.message || 'Internal error',
    });
  }
});

router.post('/preview', requireAuth, async (req, res) => {
  try {
    const validation = validateJournalRequestBody(req.body);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, message: validation.message });
    }

    const preview = await preview_single_transaction(validation.value);
    return res.json({ ok: true, ...preview });
  } catch (err) {
    console.error('Journal preview failed:', err);
    return res.status(500).json({
      ok: false,
      message: err?.message || 'Internal error',
    });
  }
});

export default router;
