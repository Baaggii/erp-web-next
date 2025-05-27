// File: api-server/server.js
import express  from 'express';
import path     from 'path';
import dotenv   from 'dotenv';
import cookieParser from 'cookie-parser';
import authRouter   from './routes/auth.js';
import usersRouter  from './routes/users.js';
import dbtestRouter from './routes/dbtest.js';
import { initPools } from './db.js';
import { attachAuth } from './middlewares/auth.js';

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());
initPools(app);            // sets up app.set('erpPool', ...)
attachAuth(app);           // reads token cookie → req.user, req.user.isAdmin

// auth first
app.use('/erp/api', authRouter);
// then protected
app.use('/erp/api/users', usersRouter);
// dbtest & others
app.use('/erp/api/dbtest', dbtestRouter);

// serve the React build
app.use('/erp', express.static(path.join(process.cwd(), 'dist')));
app.get('/erp/*', (_req, res) =>
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'))
);

app.listen(process.env.API_PORT || 3001, () =>
  console.log(`✅ ERP API listening on port ${process.env.API_PORT||3001}`)
);
