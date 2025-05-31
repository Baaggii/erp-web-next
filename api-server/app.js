// api-server/app.js (or server.js—whichever name you actually start via PM2/cPanel)
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { testConnection } from '../../../db/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { logger } from './middlewares/logging.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/companies.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

// Polyfill for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());  // not signed—just parse raw cookies
app.use(logger);

// 1) Health-check (verifies DB + server is up)
app.get('/api/auth/health', async (req, res, next) => {
  try {
    const dbResult = await testConnection();
    if (!dbResult.ok) throw dbResult.error;
    return res.json({ status: 'ok' });
  } catch (err) {
    return next(err);
  }
});

// 2) Mount API routes
app.use('/api/auth', authRoutes);       // /login, /logout, /me
app.use('/api/users', userRoutes);      // must send cookie
app.use('/api/companies', companyRoutes);
app.use('/api/settings', settingsRoutes);

// 3) Serve SPA static assets and fallback to index.html
//    We assume your Vite build ultimately lands in /home/mgtmn/erp.mgt.mn
const buildDir = path.resolve(__dirname, '../../../erp.mgt.mn');
app.use(express.static(buildDir));

// Any request that didn’t match /api/* → serve React’s index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(buildDir, 'index.html'));
});

// 4) Centralized error handler (last middleware)
app.use(errorHandler);

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`✅ ERP API & SPA listening on port ${port}`));
