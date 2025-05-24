// File: api-server/server.js

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter from './routes/auth.js';
import dbtestRouter from './routes/dbtest.js';
import formsRouter from './routes/forms.js';
import { requireAuth } from './middlewares/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middlewares
app.use(cookieParser());
app.use(express.json());

// Create & expose the DB pool
const erpPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
console.log('🗄️  Connected to DB:', process.env.DB_NAME, '@', process.env.DB_HOST);
app.set('erpPool', erpPool);

// Mount the test route *before* your SPA fallback
app.use('/api', dbtestRouter);
app.use('/erp/api', dbtestRouter);

// Mount auth & forms under the same paths
app.use('/erp/api', authRouter);
app.use('/erp/api', requireAuth, formsRouter);

// Health checks
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);
app.get('/erp/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// Serve your built SPA
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));
app.get('/erp/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
);

// Catch-all for anything else
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start
app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ ERP API & SPA listening on http://localhost:${PORT}/erp`)
);
