import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv  from 'dotenv';
import cookieParser from 'cookie-parser';

import authRouter   from './routes/auth.js';
import usersRouter  from './routes/users.js';
import dbtestRouter from './routes/dbtest.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cookieParser());

// 1) Mount APIs under /erp/api
app.use('/erp/api', authRouter);
app.use('/erp/api', usersRouter);
app.use('/erp/api', dbtestRouter);

// 2) Serve your React build at /erp
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));

// 404 fallback
app.use('/erp/*', (_, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const port = process.env.API_PORT || 3002;
app.listen(port, () => {
  console.log(`✅ ERP listening on http://localhost:${port}/erp`);
});
