import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Sample health check
// JSON health (for cPanel’s application/json check)
app.get(['/api/health', '/erp/api/health'], (req, res) => {
  return res.status(200).json({ status: 'ok' });
});

// HTML health (for cPanel’s text/html check)
app.get(['/health', '/erp/health'], (req, res) => {
  return res
    .status(200)
    .type('text/html')
    .send('OK');
});

// Serve SPA
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));
app.get('/erp/*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
);

app.listen(PORT, () => console.log(`ERP listening on http://localhost:${PORT}/erp`));
