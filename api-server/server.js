// File: api-server/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
// ... other routers: formsRouter, userCompaniesRouter, etc.

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

// 1) Serve built React under /erp
app.use('/erp', express.static(path.join(__dirname, '../public_html/erp')));

// 2) Mount your API routers under /erp/api
app.use('/erp/api/auth', authRouter);
app.use('/erp/api/users', usersRouter);
// ... app.use('/erp/api/user_companies', userCompaniesRouter);
// ... app.use('/erp/api/forms', formsRouter);

const port = process.env.PORT || 3002;
app.listen(port, () => {
  console.log(`✅ ERP listening on http://localhost:${port}/erp`);
});
