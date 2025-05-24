// File: api-server/server.js

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter from './routes/auth.js';
import formsRouter from './routes/forms.js';
import dbtestRouter from './routes/dbtest.js';
import { requireAuth } from './middlewares/auth.js';

dotenv.config();

const app = express();

// Single PORT definition
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cookieParser());
app.use(express.json());

// Database pool
const erpPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
console.log('🗄️  ERP DB Pool:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
});
app.set('erpPool', erpPool);

// Mount API routes:
//  - /api for direct server tests
//  - /erp/api for your SPA under the /erp base path
app.use('/api', dbtestRouter);
app.use('/erp/api', dbtestRouter);

app.use('/erp/api', authRouter);
app.use('/erp/api', requireAuth, formsRouter);

// Health‐check
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);
app.get('/erp/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// Serve the SPA
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));
app.get('/erp/*', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
);

// Global error handlers
process.on('uncaughtException',  e => console.error('❌ Uncaught Exception:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));

// Start listening
const server = app.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ ERP API & SPA listening on http://localhost:${PORT}/erp`)
);

server.on('error', e => console.error('❌ Server error:', e));
process.on('SIGTERM', () => {
  console.log('🔌 SIGTERM received. Shutting down.');
  server.close(() => process.exit(0));
});
