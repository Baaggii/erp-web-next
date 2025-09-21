import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

const exportedDir = path.join('config', 'manual-translations-tests');
const exportedPath = path.join(exportedDir, 'exportedtexts.json');
const mnLocalePath = path.join('src', 'erp.mgt.mn', 'locales', 'mn.json');
const testKey = 'manualTranslations.validation.test';
const englishValue = 'Manual validation baseline';
const mongolianValue = 'Гарын авлагын орчуулга';

async function readJsonSafe(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.headersSent = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

function createExpressStub() {
  function createRouter() {
    const middlewares = [];
    const routes = new Map();
    const register = (method) => (routePath, handler) => {
      routes.set(`${method.toUpperCase()} ${routePath}`, handler);
      return router;
    };
    const router = {
      use(fn) {
        middlewares.push(fn);
        return router;
      },
      get: register('GET'),
      post: register('POST'),
      delete: register('DELETE'),
      async invoke(method, routePath, req, res) {
        const handler = routes.get(`${method.toUpperCase()} ${routePath}`);
        if (!handler) {
          throw new Error(`Route ${method} ${routePath} not registered`);
        }
        const chain = [...middlewares, handler];
        let index = 0;
        const dispatch = async () => {
          if (index >= chain.length) return;
          const fn = chain[index++];
          await fn(req, res, async (err) => {
            if (err) throw err;
            await dispatch();
          });
        };
        await dispatch();
      },
    };
    return router;
  }
  const stub = { Router: createRouter };
  stub.default = stub;
  return stub;
}

async function ensureBaselineFile() {
  await fs.mkdir(exportedDir, { recursive: true });
  await writeJson(exportedPath, {
    translations: { [testKey]: englishValue },
    meta: {
      [testKey]: {
        module: 'tests/manual',
        context: 'button',
      },
    },
  });
}

async function removeTestArtifacts() {
  const mnData = await readJsonSafe(mnLocalePath);
  if (Object.prototype.hasOwnProperty.call(mnData, testKey)) {
    delete mnData[testKey];
    await writeJson(mnLocalePath, mnData);
  }
  await fs.rm(exportedDir, { recursive: true, force: true });
}

async function createRouterInstance() {
  const expressStub = createExpressStub();
  const { createManualTranslationsRouter } = await mock.import(
    '../../api-server/routes/manual_translations.js',
    {
      express: expressStub,
      '../middlewares/auth.js': {
        requireAuth: (req, _res, next) => {
          req.user = { id: 'tester', companyId: 0 };
          next();
        },
      },
      './manual_translationsLimiter.js': {
        createManualTranslationsLimiter: () => (_req, _res, next) => next(),
      },
    },
  );
  return createManualTranslationsRouter();
}

if (typeof mock?.import !== 'function') {
  test('manual translations validation rejects English submissions', { skip: true }, () => {});
  test('manual translations validation accepts Mongolian text', { skip: true }, () => {});
} else {
  await test('manual translations validation rejects English submissions', async () => {
    await removeTestArtifacts();
    await ensureBaselineFile();
    const router = await createRouterInstance();
    try {
      const req = {
        body: {
          key: testKey,
          type: 'locale',
          values: { mn: englishValue },
        },
        user: null,
        ip: '127.0.0.1',
      };
      const res = createResponse();
      await router.invoke('POST', '/', req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body?.error, 'translation_validation_failed');
      assert.equal(res.body?.details?.reason, 'identical_to_base');
      assert.match(res.body?.message || '', /English baseline|English text/i);
      const mnData = await readJsonSafe(mnLocalePath);
      assert.equal(Object.prototype.hasOwnProperty.call(mnData, testKey), false);
    } finally {
      await removeTestArtifacts();
    }
  });

  await test('manual translations validation accepts Mongolian text', async () => {
    await removeTestArtifacts();
    await ensureBaselineFile();
    const router = await createRouterInstance();
    try {
      const req = {
        body: {
          key: testKey,
          type: 'locale',
          values: { mn: mongolianValue },
        },
        user: null,
        ip: '127.0.0.1',
      };
      const res = createResponse();
      await router.invoke('POST', '/', req, res);
      assert.equal(res.statusCode, 204);
      const mnData = await readJsonSafe(mnLocalePath);
      assert.equal(mnData[testKey], mongolianValue);
    } finally {
      await removeTestArtifacts();
    }
  });
}
