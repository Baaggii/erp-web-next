// File: api-server/server.js
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import authRouter from './routes/auth.js';
import dbtestRouter from './routes/dbtest.js';
import formsRouter from './routes/forms.js';
import usersRouter from './routes/users.js';
import { requireAuth, requireAdmin } from './middlewares/auth.js';

// Emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cookieParser());
app.use(express.json());

// Database pool
const erpPool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
console.log('🗄️  Connected to DB:', `${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.DB_NAME}`);
app.set('erpPool', erpPool);

// Mount routes for direct API testing
app.use('/api', dbtestRouter);
app.use('/api', authRouter);
app.use('/api', requireAuth, formsRouter);

// Mount routes under /erp/api for the SPA
app.use('/erp/api', authRouter);
app.use('/erp/api', dbtestRouter);
app.use('/erp/api', requireAuth, formsRouter);
app.use('/erp/api/users', requireAuth, usersRouter);
app.use('/erp/api/users', usersRouter);

// Health checks
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);
app.get('/erp/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// Serve your built SPA
// If you build into a `dist/` folder, leave this as-is.
// If you build directly into public_html/erp, point here instead.
const spaDir = path.join(__dirname, '..', '../public_html/erp');
app.use('/erp', express.static(spaDir));
app.get('/erp/*', (_req, res) =>
  res.sendFile(path.join(spaDir, 'index.html'))
);

// Catch-all 404 for anything else
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Start the server
app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ ERP listening on http://localhost:${PORT}/erp`)
);

// Handle process events
process.on('uncaughtException',  e => console.error('❌ Uncaught Exception:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));
process.on('SIGTERM', () => {
  console.log('🔌 SIGTERM received. Shutting down.');
  process.exit(0);
});
