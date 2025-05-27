// File: api-server/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter from './routes/auth.js';
import dbtestRouter from './routes/dbtest.js';
import formsRouter from './routes/forms.js';
import usersRouter from './routes/users.js';
import { requireAuth } from './middlewares/auth.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

// ─── MySQL pool ───────────────────────────────────────────────
const erpPool = await mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0
});
app.set('erpPool', erpPool);

// ─── PUBLIC endpoints ─────────────────────────────────────────
app.use('/erp/api/health', dbtestRouter);
app.use('/erp/api', authRouter);

// ─── PROTECTED user endpoints ─────────────────────────────────
app.use('/erp/api/forms', requireAuth, formsRouter);
app.use('/erp/api/users', requireAuth, usersRouter);

// ─── SERVE STATIC REACT build ────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url));
app.use('/erp', express.static(path.join(__dirname, '../public_html/erp')));

// ─── START ────────────────────────────────────────────────────
const port = process.env.API_PORT || 3002;
app.listen(port, () => {
  console.log(`✅ ERP listening on http://localhost:${port}/erp`);
});
