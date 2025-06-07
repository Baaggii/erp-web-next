import express from 'express';
import multer from 'multer';
import { uploadCodingTable } from '../controllers/codingTableController.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', requireAuth, upload.single('file'), uploadCodingTable);

export default router;
