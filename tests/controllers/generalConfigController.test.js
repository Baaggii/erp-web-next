import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGeneralConfig, saveGeneralConfig } from '../../api-server/controllers/generalConfigController.js';

function createRes() {
  return {
    code: undefined,
    body: undefined,
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
    sendStatus(c) {
      this.code = c;
      return this;
    },
  };
}

test('fetchGeneralConfig requires system_settings permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    session: { permissions: { system_settings: 0 } },
    getGeneralConfig: async () => ({ config: {}, isDefault: false })
  };
  const res = createRes();
  await fetchGeneralConfig(req, res, () => {});
  assert.equal(res.code, 403);
});

test('saveGeneralConfig requires system_settings permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    body: {},
    session: { permissions: { system_settings: 0 } },
    updateGeneralConfig: async () => {
      throw new Error('should not update');
    },
  };
  const res = createRes();
  await saveGeneralConfig(req, res, () => {});
  assert.equal(res.code, 403);
});

test('saveGeneralConfig allows update with permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    body: { general: { aiApiEnabled: true } },
    session: { permissions: { system_settings: 1 } },
    updateGeneralConfig: async (body) => ({ ...body, isDefault: false }),
  };
  const res = createRes();
  await saveGeneralConfig(req, res, () => {});
  assert.deepEqual(res.body, { general: { aiApiEnabled: true }, isDefault: false });
});

test('saveGeneralConfig allows update with user-level permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    body: { general: { aiApiEnabled: true } },
    session: {
      permissions: { system_settings: 0 },
      user_level: 3,
      __userLevelActions: { permissions: { system_settings: true } },
    },
    updateGeneralConfig: async (body) => ({ ...body, isDefault: false }),
  };
  const res = createRes();
  await saveGeneralConfig(req, res, () => {});
  assert.deepEqual(res.body, { general: { aiApiEnabled: true }, isDefault: false });
});

test('fetchGeneralConfig allows system admin', async () => {
  const req = {
    user: { empid: 1, companyId: 0 },
    session: { permissions: { system_settings: 1 }, company_id: 0 },
    getGeneralConfig: async () => ({
      config: { general: { aiApiEnabled: true } },
      isDefault: false,
    }),
  };
  const res = createRes();
  await fetchGeneralConfig(req, res, () => {});
  assert.deepEqual(res.body, { general: { aiApiEnabled: true }, isDefault: false });
});

test('saveGeneralConfig allows system admin', async () => {
  const req = {
    user: { empid: 1, companyId: 0 },
    body: { general: { aiApiEnabled: true } },
    session: { permissions: { system_settings: 1 }, company_id: 0 },
    updateGeneralConfig: async (body) => ({ ...body, isDefault: false }),
  };
  const res = createRes();
  await saveGeneralConfig(req, res, () => {});
  assert.deepEqual(res.body, { general: { aiApiEnabled: true }, isDefault: false });
});
