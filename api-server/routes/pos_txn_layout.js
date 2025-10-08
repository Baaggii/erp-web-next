import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getLayout, getAllLayouts, setLayout } from '../services/posTransactionLayout.js';
import { resolveScopedCompanyId } from '../utils/requestScopes.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const name = req.query.name;
    if (name) {
      const cfg = await getLayout(name, companyId);
      res.json(cfg || {});
    } else {
      const all = await getAllLayouts(companyId);
      res.json(all);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = resolveScopedCompanyId(
      req.query.companyId,
      req.user.companyId,
    );
    const { name, layout } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await setLayout(name, layout || {}, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
