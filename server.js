import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from /erp
app.use('/erp', express.static(path.join(__dirname, 'dist')));

// History API fallback for React Router
app.get('/erp/*', (_, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ERP running at http://localhost:${PORT}/erp`);
});
