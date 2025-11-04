import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { postPosTransaction } from '../services/postPosTransaction.js';
import { getConfig } from '../services/posTransactionConfig.js';
import { getFormConfig } from '../services/transactionFormConfig.js';
import {
  buildReceiptFromPosTransaction,
  sendReceipt,
} from '../services/posApiService.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { name, data, session } = req.body;
    if (!data) return res.status(400).json({ message: 'invalid data' });
    const info = { ...(session || {}), userId: req.user.id };
    const id = await postPosTransaction(name, data, info, companyId);

    let posApiResponse;
    try {
      const { config: layoutConfig } = await getConfig(name, companyId);

      let posApiEnabled = false;
      let posApiType;

      if (layoutConfig?.masterTable) {
        const masterTable = layoutConfig.masterTable;
        let masterForm = layoutConfig.masterForm;
        if (!masterForm && Array.isArray(layoutConfig.tables)) {
          const matching = layoutConfig.tables.find(
            (entry) => entry?.table === masterTable && entry?.form,
          );
          if (matching?.form) {
            masterForm = matching.form;
          }
        }

        if (masterForm) {
          try {
            const { config: formConfig } = await getFormConfig(
              masterTable,
              masterForm,
              companyId,
            );
            posApiEnabled = Boolean(formConfig?.posApiEnabled);
            posApiType = formConfig?.posApiType;
          } catch (err) {
            console.error('[POSAPI] Failed to load dynamic form config', err);
          }
        }
      }

      if (posApiEnabled) {
        const payload = buildReceiptFromPosTransaction(data, {
          posApiType,
          layoutConfig,
        });
        if (payload) {
          posApiResponse = await sendReceipt(payload);
        } else {
          console.error(
            '[POSAPI] Skipping receipt submission due to incomplete payload',
          );
          posApiResponse = {
            success: false,
            error: 'POSAPI payload missing mandatory data',
          };
        }
      }
    } catch (err) {
      console.error('[POSAPI] Failed to send receipt', err);
    }

    const responseBody = { id };
    if (posApiResponse !== undefined) {
      responseBody.posApiResponse = posApiResponse;
    }

    res.json(responseBody);
  } catch (err) {
    next(err);
  }
});

export default router;
