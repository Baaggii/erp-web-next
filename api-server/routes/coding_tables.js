import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { upsertCodingTableRow } from '../services/codingTableRowUpsert.js';
import { requireAuth } from '../middlewares/auth.js';

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

router.post('/upsert-row', requireAuth, async (req, res, next) => {
  try {
    const { table, row } = req.body || {};
    if (!table || !row || typeof row !== 'object') {
      return res.status(400).json({ message: 'table and row required' });
    }
    const result = await upsertCodingTableRow(table, row);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
