import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    headers: {},
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
    setHeader(name, value) {
      this.headers[name] = value;
    },
    async download(filePath) {
      this.body = await fs.readFile(filePath, 'utf8');
      this.ended = true;
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
      handler.length >= 3
        ? handler(req, res, next)
        : handler(req, res);
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
  test('cnc_processing handlers return download metadata and gcode output', { skip: true }, () => {});
} else {
  test('cnc_processing handlers return download metadata and gcode output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cnc-processing-'));
    const outputPath = path.join(tempDir, 'output.gcode');
    const gcode = 'G1 X0 Y0\nM2\n';
    await fs.writeFile(outputPath, gcode, 'utf8');

    const cncService = {
      processCncFile: mock.fn(async () => ({
        id: 'abc123',
        fileName: 'output.gcode',
      })),
      getCncOutput: mock.fn((id) =>
        id === 'abc123'
          ? {
              id: 'abc123',
              fileName: 'output.gcode',
              path: outputPath,
              mimeType: 'text/plain',
            }
          : null,
      ),
    };

    const { default: cncProcessingRoutes } = await mock.import(
      '../../api-server/routes/cnc_processing.js',
      {
        express: {
          default: { Router: createRouter },
        },
        multer: {
          default: Object.assign(
            () => ({
              single: () => (req, res, next) => {
                if (req.mockFile) req.file = req.mockFile;
                next();
              },
            }),
            { memoryStorage: () => ({}) },
          ),
        },
        'express-rate-limit': {
          default: () => (req, res, next) => next(),
        },
        '../middlewares/auth.js': {
          requireAuth: (req, res, next) => {
            req.user = { empid: 'EMP-1', companyId: 1, id: 1 };
            req.session = {};
            next();
          },
        },
        '../../db/index.js': { getEmploymentSession: async () => ({}) },
        '../utils/hasAction.js': { hasAction: async () => true },
        '../services/cncProcessingService.js': cncService,
      },
    );

    try {
      const postHandlers = cncProcessingRoutes.routes.post.get('/');
      assert.ok(postHandlers);

      const postReq = {
        body: {},
        mockFile: {
          originalname: 'sample.png',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-image'),
        },
        protocol: 'http',
        get: (name) => (name === 'host' ? 'localhost:3000' : undefined),
      };
      const postRes = createRes();

      await runHandlers(postHandlers, postReq, postRes);

      assert.equal(postRes.statusCode, 200);
      assert.equal(postRes.body.fileName, 'output.gcode');
      assert.equal(postRes.body.outputFormat, 'gcode');
      assert.ok(postRes.body.downloadUrl.includes('/api/cnc_processing/download/abc123'));

      const getHandlers = cncProcessingRoutes.routes.get.get('/download/:id');
      assert.ok(getHandlers);

      const getReq = {
        params: { id: 'abc123' },
        protocol: 'http',
        get: () => 'localhost:3000',
        user: { empid: 'EMP-1', companyId: 1, id: 1 },
        session: {},
      };
      const getRes = createRes();

      await runHandlers(getHandlers, getReq, getRes);

      assert.equal(getRes.statusCode, 200);
      assert.ok(String(getRes.body).includes('G1'));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      mock.restoreAll();
    }
  });
}
