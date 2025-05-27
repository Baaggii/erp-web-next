// File: api-server/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import userCompaniesRouter from './routes/user_companies.js';
import dbtestRouter from './routes/dbtest.js';
import companiesRouter from './routes/companies.js';   // optional

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// parse JSON bodies + cookies
app.use(express.json());
app.use(cookieParser());

// create & store MySQL pool
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
app.set('erpPool', pool);

// serve your React build (dist) at /erp
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));

// mount JSON API at /api
app.use('/api', authRouter);                  // /api/login, /api/logout, /api/health
app.use('/api/users', usersRouter);           // /api/users, /api/users/:id, /api/users/me, /api/users/:id/password
app.use('/api/user_companies', userCompaniesRouter);
app.use('/api/dbtest', dbtestRouter);
app.use('/api/companies', companiesRouter);   // if you have a companies table

// single‐page fallback for React routes under /erp/*
app.use('/erp/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ ERP listening at http://localhost:${PORT}/erp`);
});
