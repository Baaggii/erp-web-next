import express from 'express';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { logger } from './middlewares/logging.js';

export function createApp() {
  const app = express();
  app.use(logger);
  app.use(express.json());
  app.use(cookieParser());
  Object.values(routes).forEach(r => app.use(r.path, r.router));
  app.use(errorHandler);
  return app;
}