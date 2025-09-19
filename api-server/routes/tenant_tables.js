import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import * as tenantTablesController from '../controllers/tenantTablesController.js';
import { registerTenantTablesRoutes } from './tenantTablesRouterFactory.js';

const router = express.Router();

registerTenantTablesRoutes({
  router,
  requireAuth,
  controller: tenantTablesController,
});

export default router;
