import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

function createRouter() {
  const routes = { post: new Map(), get: new Map() };
  return {
    routes,
    post: (routePath, ...handlers) => {
      routes.post.set(routePath, handlers);
    },
    get: (routePath, ...handlers) => {
      routes.get.set(routePath, handlers);
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
  };
}

async function runHandlers(handlers, req, res) {
  let index = 0;
  const next = async (err) => {
    if (err) throw err;
    if (res.ended) return;
    const handler = handlers[index++];
    if (!handler) return;
    const result =
      handler.length >= 3 ? handler(req, res, next) : handler(req, res);
    if (result?.then) {
      await result;
    }
    if (!res.ended && handler.length < 3) {
      await next();
    }
  };
  await next();
}

if (typeof mock.import !== 'function') {
  test(
    'procedures route lock flag defaults',
    { skip: true },
    () => {},
  );
} else {
  test('procedures route defaults collectLocks to false', async () => {
    const callStoredProcedure = mock.fn(async () => [{ id: 1 }]);

    const { default: procedureRoutes } = await mock.import(
      '../../api-server/routes/procedures.js',
      {
        express: {
          default: { Router: createRouter },
        },
        '../middlewares/auth.js': {
          requireAuth: (req, res, next) => {
            req.user = { empid: 'EMP-1', companyId: 1, id: 7 };
            next();
          },
        },
        '../../db/index.js': {
          callStoredProcedure,
          listStoredProcedures: async () => [],
          getProcedureParams: async () => [],
          getProcedureRawRows: async () => ({ rows: [] }),
          getProcedureLockCandidates: async () => [],
          getReportLockCandidatesForRequest: async () => [],
          pool: { query: async () => [[{ ok: 1 }]] },
        },
        '../utils/reportProcedures.js': {
          listPermittedProcedures: async () => ({
            procedures: [{ name: 'sp_report' }],
          }),
        },
      },
    );

    try {
      const handlers = procedureRoutes.routes.post.get('/');
      assert.ok(handlers);

      const req = {
        body: { name: 'sp_report', params: [] },
        query: {},
        ip: '127.0.0.1',
      };
      const res = createRes();

      await runHandlers(handlers, req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.lockRequestId, null);
      assert.equal(callStoredProcedure.mock.calls.length, 1);
      const [, , , options] = callStoredProcedure.mock.calls[0].arguments;
      assert.equal(options.session.collectUsedRows, false);
      assert.equal(options.session.requestId, null);
    } finally {
      mock.restoreAll();
    }
  });

  test('procedures route collects locks when requested', async () => {
    const callStoredProcedure = mock.fn(async () => [{ id: 1 }]);

    const { default: procedureRoutes } = await mock.import(
      '../../api-server/routes/procedures.js',
      {
        express: {
          default: { Router: createRouter },
        },
        '../middlewares/auth.js': {
          requireAuth: (req, res, next) => {
            req.user = { empid: 'EMP-1', companyId: 1, id: 7 };
            next();
          },
        },
        '../../db/index.js': {
          callStoredProcedure,
          listStoredProcedures: async () => [],
          getProcedureParams: async () => [],
          getProcedureRawRows: async () => ({ rows: [] }),
          getProcedureLockCandidates: async () => [],
          getReportLockCandidatesForRequest: async () => [],
          pool: { query: async () => [[{ ok: 1 }]] },
        },
        '../utils/reportProcedures.js': {
          listPermittedProcedures: async () => ({
            procedures: [{ name: 'sp_report' }],
          }),
        },
      },
    );

    try {
      const handlers = procedureRoutes.routes.post.get('/');
      assert.ok(handlers);

      const req = {
        body: { name: 'sp_report', params: [], collectLocks: true },
        query: {},
        ip: '127.0.0.1',
      };
      const res = createRes();

      await runHandlers(handlers, req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.lockRequestId);
      assert.equal(callStoredProcedure.mock.calls.length, 1);
      const [, , , options] = callStoredProcedure.mock.calls[0].arguments;
      assert.equal(options.session.collectUsedRows, true);
      assert.equal(options.session.requestId, res.body.lockRequestId);
    } finally {
      mock.restoreAll();
    }
  });
}
