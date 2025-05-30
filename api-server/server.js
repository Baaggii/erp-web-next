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
import { errorHandler } from './middlewares/errorHandler.js';
import { logger } from './middlewares/logging.js';

const app = express();

// 1. Serve API under /api
app.use('/api', apiRouter);   // mount your existing routes under /api

app.use(logger);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user_companies', userCompRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dbtest', dbTestRoutes);
app.use('/api/settings', settingsRoutes);

// 2. Serve built ERP front-end
const staticPath = path.resolve(__dirname, '../erp.mgt.mn');
app.use(express.static(staticPath, { index: 'index.html' }));
// Fallback for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`ERP API running on port ${PORT}`));