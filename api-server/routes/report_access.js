import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import {
  listAllowedReports,
  getAllowedReport,
  setAllowedReport,
  removeAllowedReport,
} from '../services/reportAccessConfig.js';
import { listReportProcedures } from '../../db/index.js';
import { isKnownDetailProcedure } from '../services/reportDetailProcedures.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const proc = req.query.proc;
    const liveProcedures = new Set(await listReportProcedures());
    if (proc) {
      if (!liveProcedures.has(proc) || isKnownDetailProcedure(proc)) {
        return res.status(404).json({ message: 'Procedure not found' });
      }
      const { config, isDefault } = await getAllowedReport(proc, companyId);
      res.json({ ...config, isDefault });
    } else {
      const { config, isDefault } = await listAllowedReports(companyId);
      const filtered = Object.fromEntries(
        Object.entries(config).filter(
          ([name]) => liveProcedures.has(name) && !isKnownDetailProcedure(name),
        ),
      );
      res.json({ allowedReports: filtered, isDefault });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { proc, branches, departments, permissions, workplaces, positions } =
      req.body;
    if (!proc) return res.status(400).json({ message: 'proc is required' });
    await setAllowedReport(
      proc,
      { branches, departments, permissions, workplaces, positions },
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
