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
  router.post('/', requireAuth, createTenantTable);
  router.put('/:table_name', requireAuth, updateTenantTable);
  router.get('/options', requireAuth, listTenantTableOptions);
  router.post('/zero-keys', requireAuth, resetSharedTenantKeys);
  router.post('/seed-defaults', requireAuth, seedDefaults);
  router.post('/export-defaults', requireAuth, exportDefaults);
  router.get('/default-snapshots', requireAuth, listDefaultSnapshots);
  router.post('/restore-defaults', requireAuth, restoreDefaults);
  router.post('/seed-companies', requireAuth, seedExistingCompanies);
  router.post('/seed-company', requireAuth, seedCompany);
  router.get('/:table_name', requireAuth, getTenantTable);
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
