// File: api-server/routes/forms.js
import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// if you’re just testing static HTML forms, e.g. public/forms.html
router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/forms.html'));
});

export default router;
