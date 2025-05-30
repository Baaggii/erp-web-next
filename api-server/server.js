import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { testConnection } from '../db/index.js';
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
app.use(cookieParser(process.env.JWT_SECRET));
app.use(logger);

// Health-check: also verify DB connection
app.get('/api/auth/health', async (req, res, next) => {
  try {
    const dbResult = await testConnection();
    if (!dbResult.ok) throw dbResult.error;
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/settings', settingsRoutes);

// Serve static React build and fallback to index.html
const buildDir = path.resolve(__dirname, '../erp.mgt.mn');
app.use(express.static(buildDir));
app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));

// Error middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || 3002;
app.listen(port, () => console.log(`✅ ERP API & SPA listening on port ${port}`));
