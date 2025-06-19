import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

router.post('/upload', requireAuth, upload.single('file'), uploadCodingTable);

export default router;
