import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantTablesRouter } from '../../api-server/routes/tenantTablesRouterFactory.js';

function splitPath(path) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return [];
  return trimmed.split('/');
}

function matchPath(pattern, actual) {
  const params = {};
  const patternParts = splitPath(pattern);
  const actualParts = splitPath(actual);
  if (patternParts.length !== actualParts.length) {
    return null;
  }
  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i];
    const actualPart = actualParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = actualPart;
      continue;
    }
    if (part !== actualPart) {
      return null;
    }
  }
  return params;
}

class RouterDouble {
  constructor() {
    this.routes = [];
  }

  register(method, path, handlers) {
    this.routes.push({ method, path, handlers });
  }

  get(path, ...handlers) {
    this.register('GET', path, handlers);
  }

  post(path, ...handlers) {
    this.register('POST', path, handlers);
  }

  put(path, ...handlers) {
    this.register('PUT', path, handlers);
  }

  delete(path, ...handlers) {
    this.register('DELETE', path, handlers);
  }

  async dispatch(method, path, req, res) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchPath(route.path, path);
      if (!params) continue;
      req.params = params;
      let index = -1;
      const next = async () => {
        index += 1;
        const handler = route.handlers[index];
        if (!handler) return;
        if (handler.length >= 3) {
          await handler(req, res, next);
        } else {
          await handler(req, res);
          await next();
        }
      };
      await next();
      return true;
    }
    return false;
  }
}

function createResponseDouble() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.headers['content-type'] = 'application/json; charset=utf-8';
      this.body = payload;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = undefined;
      return this;
    },
  };
}

function createUnexpectedHandler(name) {
  return async () => {
    throw new Error(`Unexpected call to ${name}`);
  };
}

test('GET /api/tenant_tables/default-snapshots returns snapshots', async () => {
  const routerDouble = new RouterDouble();
  const snapshots = [
    { fileName: 'tenant-defaults-20240101.json', createdAt: '2024-01-01T00:00:00.000Z' },
  ];
  let snapshotCalls = 0;
  let tableCalls = 0;

  const controller = {
    listTenantTables: createUnexpectedHandler('listTenantTables'),
    createTenantTable: createUnexpectedHandler('createTenantTable'),
    updateTenantTable: createUnexpectedHandler('updateTenantTable'),
    listTenantTableOptions: createUnexpectedHandler('listTenantTableOptions'),
    getTenantTable: async (req, res) => {
      tableCalls += 1;
      res.status(404).json({ message: 'Table not found' });
    },
    resetSharedTenantKeys: createUnexpectedHandler('resetSharedTenantKeys'),
    seedDefaults: createUnexpectedHandler('seedDefaults'),
    exportDefaults: createUnexpectedHandler('exportDefaults'),
    seedExistingCompanies: createUnexpectedHandler('seedExistingCompanies'),
    seedCompany: createUnexpectedHandler('seedCompany'),
    insertDefaultTenantRow: createUnexpectedHandler('insertDefaultTenantRow'),
    updateDefaultTenantRow: createUnexpectedHandler('updateDefaultTenantRow'),
    deleteDefaultTenantRow: createUnexpectedHandler('deleteDefaultTenantRow'),
    listDefaultSnapshots: async (req, res) => {
      snapshotCalls += 1;
      res.json({ snapshots });
    },
    restoreDefaults: createUnexpectedHandler('restoreDefaults'),
  };

  const router = createTenantTablesRouter({
    createRouter: () => routerDouble,
    requireAuth: (req, res, next) => {
      req.user = { empid: 5, companyId: 0, userLevel: 2 };
      next();
    },
    controller,
  });

  assert.equal(router, routerDouble);

  const req = { headers: {} };
  const res = createResponseDouble();
  const matched = await router.dispatch('GET', '/default-snapshots', req, res);

  assert.equal(matched, true);
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type']?.includes('application/json'));
  assert.deepEqual(res.body, { snapshots });
  assert.equal(snapshotCalls, 1);
  assert.equal(tableCalls, 0);
});
