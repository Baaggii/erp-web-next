import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter   from './routes/auth.js';
import dbtestRouter from './routes/dbtest.js';
import formsRouter  from './routes/forms.js';
import usersRouter  from './routes/users.js';
import companiesRouter from './routes/user_companies.js';
import { requireAuth } from './middlewares/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

// attach your DB pool
const pool = await mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  database: process.env.ERP_DB_NAME,
});
app.set('erpPool', pool);

// 1️⃣ Serve the React app build under /erp
app.use(
  '/erp',
  express.static(path.join(__dirname, '../public_html/erp'))
);

// 2️⃣ API under /erp/api
app.use('/erp/api/dbtest',   dbtestRouter);
app.use('/erp/api/auth',     authRouter);
app.use('/erp/api/forms',    requireAuth, formsRouter);
app.use('/erp/api/users',    requireAuth, usersRouter);
app.use('/erp/api/user_companies', requireAuth, companiesRouter);

// 3️⃣ Health-check
app.get('/erp/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// 4️⃣ Fall back to index.html for any other /erp/* so React Router works
app.get('/erp/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public_html/erp/index.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ ERP listening on http://localhost:${PORT}/erp`);
});
