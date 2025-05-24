import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

dotenv.config();
const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cookieParser());
app.use(express.json());

// Database pools setup (ensure env vars are correct)
import mysql from 'mysql2/promise';
const erpPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});
app.set('erpPool', erpPool);

// Routes
import authRouter from './routes/auth.js';
import dbtestRouter from './routes/dbtest.js';
import formsRouter from './routes/forms.js';
import dbtestRouter from './routes/dbtest.js';

// Mount your routers under /erp/api
app.use('/erp/api', authRouter);
app.use('/erp/api', dbtestRouter);
app.use('/erp/api', requireAuth, formsRouter);
app.use('/erp/api', dbtestRouter);    // DB connection test
app.use('/api', dbtestRouter);

// Serve the SPA (fallback)
app.use('/erp', express.static(path.resolve(__dirname, '../public_html/erp')));
app.get('/erp/*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public_html/erp/index.html'));
});

// Health check
app.get('/erp/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`ERP Server running on port ${PORT}`));
```

---
### 6.11 `api-server/routes/dbtest.js`

Add this new file to verify your database connection:

```js
// File: api-server/routes/dbtest.js
import express from 'express';
const router = express.Router();

// GET /erp/api/dbtest
router.get('/dbtest', async (_req, res) => {
  try {
    const pool = _req.app.get('erpPool');
    const [rows] = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, time: rows[0].now });
  } catch (err) {
    console.error('DB test error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
```

Be sure to create `api-server/routes/dbtest.js`, restart your server, and then:
```bash
curl -i http://127.0.0.1:3001/erp/api/dbtest
```
This will confirm whether your Express app can successfully connect to the MySQL database.
/* ---------- SETUP ---------- */
const express = require('express');
const app     = express();
const path    = require('path');
const cors    = require('cors');
const bcrypt  = require('bcrypt');
const mysql   = require('mysql2/promise');
const authRouter = require('./routes/auth');

app.use('/auth', authRouter);

/* ---------- OPTIONAL route logger ---------- */
if (!express.__routePatched) {                        // nodemon сэргээхэд давхардахгүй
  const origRoute = express.application.route;
  express.application.route = function (p) {
    console.log('↪︎ registering route:', p);
    return origRoute.call(this, p);
  };
  express.__routePatched = true;
}

/* ---------- GLOBAL HANDLERS ---------- */
process.on('uncaughtException',  e => console.error('❌ Uncaught Exception:',  e));
process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));

/* ---------- DATABASE POOLS ---------- */
const pool = mysql.createPool({ /* webshop DB config */ });
const erpPool = mysql.createPool({ /* ERP DB config */ });
app.set('erpPool', erpPool);

/* ---------- ROUTES ---------- */
// Login & logout
app.use('/api', authRouter);
// Other stubs remain as in your repo

/* ---------- HEALTH CHECK ---------- */
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/* ---------- SERVER ---------- */
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`✅ ERP listening on http://localhost:${PORT}/erp`));

server.on('error', e => console.error('❌ Server error:', e));
process.on('SIGTERM', () => { console.log('🔌 SIGTERM signal received. Closing server.'); server.close(() => process.exit(0)); });
```}]}js
/* ---------- SETUP ---------- */
const express = require('express');
const app     = express();
const path    = require('path');
const cors    = require('cors');
const bcrypt  = require('bcrypt');
const mysql   = require('mysql2/promise');
const cookieParser = require('cookie-parser');
const authRouter   = require('./routes/auth');
const formsRouter  = require('./routes/forms');
const { requireAuth } = require('./middlewares/auth');

/* Init Middleware */
app.use(cors({
  origin: (o, cb) => (!o || ['https://modmarket.mn', `http://localhost:${process.env.PORT}`].includes(o) ? cb(null, true) : cb(new Error('CORS blocked')))
}));
app.use(cookieParser());
app.use(express.json());

/* Mount Routes */
app.use('/erp/api', authRouter);
app.use('/erp/api', requireAuth, formsRouter);

/* Serve SPA Static */
app.use('/erp', express.static(path.join(__dirname, '..', 'dist')));
app.get('/erp/*', (_, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')));

/* Health & Errors */
app.get('/erp/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Error handling
process.on('uncaughtException',  e => console.error('❌ Uncaught Exception:',  e));
process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`✅ ERP listening on http://localhost:${PORT}/erp`));

server.on('error', e => console.error('❌ Server error:', e));
process.on('SIGTERM', () => { console.log('🔌 SIGTERM signal received. Closing server.'); server.close(() => process.exit(0)); });