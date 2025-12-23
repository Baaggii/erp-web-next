import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listAllowedReports,
  getAllowedReport,
  setAllowedReport,
  removeAllowedReport,
} from '../services/reportAccessConfig.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const proc = req.query.proc;
    if (proc) {
      const { config, isDefault } = await getAllowedReport(proc, companyId);
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await listAllowedReports(companyId);
      res.json({ allowedReports: config, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { proc, branches, departments, permissions, workplaces } = req.body;
    if (!proc) return res.status(400).json({ message: 'proc is required' });
    await setAllowedReport(
      proc,
      { branches, departments, permissions, workplaces },
      companyId,
    );
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const proc = req.query.proc;
    if (!proc) return res.status(400).json({ message: 'proc is required' });
    await removeAllowedReport(proc, companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

export default router;
