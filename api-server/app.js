import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/companies.js';
import settingsRoutes from './routes/settings.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { logger } from './middlewares/logging.js';

export function createApp() {
  const app = express();
  app.use(logger);
  app.use(express.json());
  app.use(cookieParser(process.env.COOKIE_NAME));

  // Mount API routers
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/settings', settingsRoutes);

  // Centralized error handling
  app.use(errorHandler);
  return app;
}