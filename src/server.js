/* ---------- SETUP ---------- */
const express = require('express');
const app     = express();
const path    = require('path');
const cors    = require('cors');
const bcrypt  = require('bcrypt');
const mysql   = require('mysql2/promise');


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

/* ---------- CORS ---------- */
/* ---------- PORT ---------- */
// ❶  production ( Passenger ) → process.env.PORT
// ❷  локал develop          → .env-ийн PORT  эсвэл 3001

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () =>
console.log(`✅ API ready on port ${PORT}`)
);

const allowed = ['https://modmarket.mn', `http://localhost:${PORT}`];

app.use(cors({
  origin: (o, cb) => (!o || allowed.includes(o) ? cb(null, true)
                                               : cb(new Error('CORS blocked')))
}));

app.use(express.json());

/* ---------- (optional) serve React build ---------- */
// const build = path.join(__dirname, 'build');
// app.use('/erp', express.static(build));
// app.get('/erp/*', (_, res) => res.sendFile(path.join(build, 'index.html')));

/* ---------- DATABASE POOLS ---------- */
const pool = mysql.createPool({                      // webshop DB
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const erpPool = mysql.createPool({                   // ERP DB
  host: process.env.ERP_DB_HOST,
  user: process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  database: process.env.ERP_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

/* ---------- ROUTES ---------- */
//app.use('/api', router);

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [[user]] = await erpPool.query(
      'SELECT * FROM users WHERE email = ? OR id = ?',
      [email, email]
    );
    if (!user)               return res.status(401).json({ message: 'Хэрэглэгч олдсонгүй' });
    if (!await bcrypt.compare(password, user.password))
                             return res.status(401).json({ message: 'Нууц үг буруу байна' });

    delete user.password;
    res.json({ user });
} catch (err) {
-  console.error('❌ DB error:', err);
+  console.error('❌ DB error:', err.code, err.sqlMessage);
   res.status(500).json({ message: 'Серверийн алдаа' });
}
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Амжилттай гарлаа' });
});

//app.post('/api/create-admin', async (req, res) => {
// const { email, password, name, company = 'ModMarket ХХК', id = null } = req.body;
//  try {
//    const [[dup]] = await erpPool.query('SELECT id FROM users WHERE email = ?', [email]);
//    if (dup) return res.status(409).json({ message: `⚠️ ${email} бүртгэгдсэн байна.` });
//
//    const hashed = await bcrypt.hash(password, 10);
//    await erpPool.execute(
//      'INSERT INTO users (email, id, password, name, company, role) VALUES (?,?,?,?,?,?)',
//      [email, id, hashed, name, company, 'admin']
//    );
//    res.json({ message: '✅ Админ хэрэглэгч амжилттай үүслээ' });
//  } catch (err) {
//    console.error('❌ DB error:', err);
//    res.status(500).json({ message: 'Серверийн алдаа' });
//  }
//});

app.post('/api/create-admin', (req, res) => {
  console.log('🔧 Stub create-admin payload:', req.body);
  res.json({ message: '⚠️ DB тохиргоо дуусаагүй – stub OK' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

server.on('error', e => console.error('❌ Server error:', e));
 process.on('SIGTERM', () => {
   console.log('🔌 SIGTERM signal received. Closing server.');
   server.close(() => process.exit(0));
 });