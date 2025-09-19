export function createTenantTablesRouter({ createRouter, requireAuth, controller }) {
  if (typeof createRouter !== 'function') {
    throw new TypeError('createRouter must be a function');
  }
  if (typeof requireAuth !== 'function') {
    throw new TypeError('requireAuth must be a function');
  }
  if (!controller || typeof controller !== 'object') {
    throw new TypeError('controller must be an object');
  }

  const router = createRouter();
  if (!router || typeof router !== 'object') {
    throw new TypeError('createRouter must return a router instance');
  }

  return registerTenantTablesRoutes({ router, requireAuth, controller });
}

export function registerTenantTablesRoutes({ router, requireAuth, controller }) {
  if (!router || typeof router !== 'object') {
    throw new TypeError('router must be an object');
  }
  if (typeof router.get !== 'function') {
    throw new TypeError('router must provide a get method');
  }
  if (typeof router.post !== 'function') {
    throw new TypeError('router must provide a post method');
  }
  if (typeof router.put !== 'function') {
    throw new TypeError('router must provide a put method');
  }
  if (typeof router.delete !== 'function') {
    throw new TypeError('router must provide a delete method');
  }
  if (typeof requireAuth !== 'function') {
    throw new TypeError('requireAuth must be a function');
  }
  if (!controller || typeof controller !== 'object') {
    throw new TypeError('controller must be an object');
  }

  const {
    listTenantTables,
    createTenantTable,
    updateTenantTable,
    listTenantTableOptions,
    getTenantTable,
    resetSharedTenantKeys,
    seedDefaults,
    exportDefaults,
    seedExistingCompanies,
    seedCompany,
    insertDefaultTenantRow,
    updateDefaultTenantRow,
    deleteDefaultTenantRow,
    listDefaultSnapshots,
    restoreDefaults,
  } = controller;

  router.get('/', requireAuth, listTenantTables);
  router.get('/options', requireAuth, listTenantTableOptions);
  router.get('/default-snapshots', requireAuth, listDefaultSnapshots);
  router.get('/:table_name', requireAuth, getTenantTable);

  router.post('/', requireAuth, createTenantTable);
  router.put('/:table_name', requireAuth, updateTenantTable);

  router.post('/zero-keys', requireAuth, resetSharedTenantKeys);
  router.post('/seed-defaults', requireAuth, seedDefaults);
  router.post('/export-defaults', requireAuth, exportDefaults);
  router.post('/restore-defaults', requireAuth, restoreDefaults);
  router.post('/seed-companies', requireAuth, seedExistingCompanies);
  router.post('/seed-company', requireAuth, seedCompany);

  router.post('/:table_name/default-rows', requireAuth, insertDefaultTenantRow);
  router.put(
    '/:table_name/default-rows/:row_id',
    requireAuth,
    updateDefaultTenantRow,
  );
  router.delete(
    '/:table_name/default-rows/:row_id',
    requireAuth,
    deleteDefaultTenantRow,
  );

  return router;
}
