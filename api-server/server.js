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
import userCompaniesRouter from './routes/user_companies.js';
import { requireAuth, requireAdmin } from './middlewares/auth.js';

dotenv.config();

// Emulate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);

const app = express();
const PORT = process.env.API_PORT || 3002;

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

// mount your API under /erp/api
app.use('/erp/api', authRouter);            // POST /login, POST /logout, GET /health
app.use('/erp/api/dbtest', dbtestRouter);   // GET /dbtest
app.use('/erp/api/users', requireAuth, usersRouter);
app.use('/erp/api/user_companies', requireAuth, userCompaniesRouter);
app.use('/erp/api/forms', requireAuth, formsRouter);

// Health checks
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);
app.get('/erp/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);

// serve your React app’s build
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/erp', express.static(path.resolve(__dirname, '../public_html/erp')));
app.get('/erp/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public_html/erp/index.html'));
});

// Catch-all 404 for anything else
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Start the server
app.listen(port, () => console.log(`✅ ERP listening on http://localhost:${port}/erp`));

// Handle process events
process.on('uncaughtException',  e => console.error('❌ Uncaught Exception:', e));
process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));
process.on('SIGTERM', () => {
  console.log('🔌 SIGTERM received. Shutting down.');
  process.exit(0);
});
