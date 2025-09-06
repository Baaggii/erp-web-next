import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
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

router.post('/upload', requireAuth, upload.single('file'), uploadCodingTable);

export default router;
