import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { requireAuth } from '../middlewares/auth.js';
import { insertCodingTableRows } from '../services/codingTablesInsert.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      String(req.user.companyId),
      'coding_tables',
    );
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
});

const upload = multer({ storage });

router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    const controller = new AbortController();
    const handleClose = () => controller.abort();
    req.on('close', handleClose);
    res.on('close', handleClose);
    try {
      await uploadCodingTable(req, res, next, controller.signal);
    } finally {
      req.off('close', handleClose);
      res.off('close', handleClose);
    }
  },
);

router.post('/insertRecords', requireAuth, async (req, res, next) => {
  const controller = new AbortController();
  const handleAbort = () => controller.abort();
  req.on('close', handleAbort);
  res.on('close', handleAbort);
  try {
    const { table, mainRows = [], otherRows = [], useStaging = false } = req.body || {};
    if (!table) {
      return res.status(400).json({ message: 'table required' });
    }
    const result = await insertCodingTableRows({
      table,
      mainRows,
      otherRows,
      useStaging: Boolean(useStaging),
      signal: controller.signal,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  } finally {
    req.off('close', handleAbort);
    res.off('close', handleAbort);
  }
});

export default router;
