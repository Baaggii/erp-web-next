import test from 'node:test';
import assert from 'node:assert/strict';
import { updateLicense } from '../../api-server/controllers/companyModuleController.js';
import * as db from '../../db/index.js';

function createRes() {
  return {
    code: undefined,
    body: undefined,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; },
    sendStatus(c) { this.code = c; return this; },
  };
}

test('updateLicense requires license_settings permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    session: { permissions: { license_settings: 0 } },
    body: { companyId: 1, moduleKey: 'x', licensed: true },
  };
  const res = createRes();
  await updateLicense(req, res, () => {});
  assert.equal(res.code, 403);
});

test('updateLicense allows update with user-level permission', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    session: {
      permissions: { license_settings: 0 },
      user_level: 3,
      __userLevelActions: { permissions: { license_settings: true } },
    },
    body: { companyId: 1, moduleKey: 'x', licensed: true },
  };
  const res = createRes();
  let called = false;
  const orig = db.pool.query;
  db.pool.query = async (sql) => {
    if (/FROM companies/.test(sql)) {
      return [[{ id: 1 }]];
    }
    called = true;
    return [{}];
  };
  await updateLicense(req, res, () => {});
  assert.equal(res.code, 200);
  assert.equal(called, true);
  db.pool.query = orig;
});

test('updateLicense rejects updates for unauthorized companies', async () => {
  const req = {
    user: { empid: 1, companyId: 1 },
    session: {
      permissions: { license_settings: 1 },
    },
    body: { companyId: 2, moduleKey: 'x', licensed: true },
  };
  const res = createRes();
  const orig = db.pool.query;
  db.pool.query = async (sql) => {
    if (/FROM companies/.test(sql)) {
      return [[{ id: 1 }]]; // does not include companyId 2
    }
    return [{}];
  };
  await updateLicense(req, res, () => {});
  assert.equal(res.code, 403);
  db.pool.query = orig;
});
