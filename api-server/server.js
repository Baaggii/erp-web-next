// File: api-server/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter           from './routes/auth.js';
import dbtestRouter         from './routes/dbtest.js';
import formsRouter          from './routes/forms.js';
import usersRouter          from './routes/users.js';
import userCompaniesRouter  from './routes/user_companies.js';
import { requireAuth }      from './middlewares/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.API_PORT || 3002;

app.use(cookieParser());
app.use(express.json());

// MySQL pool
const erpPool = mysql.createPool({ /* … your env vars … */ });
app.set('erpPool', erpPool);

// **API**  
app.use('/erp/api/dbtest',        dbtestRouter);
app.use('/erp/api/auth',          authRouter);
app.use('/erp/api/forms',         requireAuth, formsRouter);
app.use('/erp/api/users',         requireAuth, usersRouter);
app.use('/erp/api/user_companies',requireAuth, userCompaniesRouter);

// Health check  
app.get('/erp/api/health', (_r, r) => r.json({ status:'ok', time: new Date() }));

// **SPA**  
const spaDir = path.join(__dirname, '../public_html/erp');
app.use('/erp', express.static(spaDir));
app.get('/erp/*', (_r, r) => r.sendFile(path.join(spaDir, 'index.html')));

// Catch-all 404  
app.use((_r, r) => r.status(404).json({ error:'Not found' }));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ ERP listening on http://localhost:${PORT}/erp`));
