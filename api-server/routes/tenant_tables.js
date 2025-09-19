import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import * as tenantTablesController from '../controllers/tenantTablesController.js';
import { createTenantTablesRouter } from './tenantTablesRouterFactory.js';

const router = createTenantTablesRouter({
  createRouter: () => express.Router(),
  requireAuth,
  controller: tenantTablesController,
});

export default router;
