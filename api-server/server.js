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
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok' })            // Content-Type: application/json
);
app.get('/health', (req, res) =>
  res.type('text/html').send('OK');     // Content-Type: text/html
);

// Serve SPA
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));
app.get('/erp/*', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
);

app.listen(PORT, () => console.log(`ERP listening on http://localhost:${PORT}/erp`));
