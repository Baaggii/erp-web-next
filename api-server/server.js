// File: api-server/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import formsRouter from './routes/forms.js';
import userCompaniesRouter from './routes/user_companies.js';
import { requireAuth, requireAdmin } from './middlewares/auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// parse JSON + cookies
app.use(express.json());
app.use(cookieParser());

// mount API routers under /erp/api
app.use('/erp/api/auth', authRouter);
app.use('/erp/api/users', requireAuth, usersRouter);
app.use('/erp/api/user_companies', requireAuth, userCompaniesRouter);
app.use('/erp/api/forms', requireAuth, formsRouter);

// Serve static front-end (Vite build output) from public_html/erp
app.use('/erp', express.static(path.join(__dirname, '../public_html/erp')));

// Always FALLBACK to index.html so React Router can do client-side routing
app.get('/erp/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public_html/erp/index.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ ERP listening on http://localhost:${PORT}/erp`);
});
