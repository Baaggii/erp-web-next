import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import userCompRoutes from './routes/user_companies.js';
import companyRoutes from './routes/companies.js';
import formsRoutes from './routes/forms.js';
import reportsRoutes from './routes/reports.js';
import dbTestRoutes from './routes/dbtest.js';
import settingsRoutes from './routes/settings.js';
import errorHandler from './middlewares/errorHandler.js';
import logger from './middlewares/logging.js';

const app = express();

// 1️⃣ Logging & JSON parsing
app.use(logger);
app.use(express.json());
app.use(cookieParser());

// 2️⃣ Mount API routes under /api
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user_companies', userCompRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dbtest', dbTestRoutes);
app.use('/api/settings', settingsRoutes);

// 3️⃣ Serve static SPA assets (no /erp prefix)
const buildDir = path.resolve(__dirname, '../erp.mgt.mn');
app.use(express.static(buildDir, { index: 'index.html' }));
// 4️⃣ Fallback to index.html for client-side routing
app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));

// 5️⃣ Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`✅ ERP API & SPA listening on port ${PORT}`));
