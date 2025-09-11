import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { exportTranslations } from '../../api-server/services/translationsExport.js';
import { login } from '../../api-server/controllers/authController.js';
import * as db from '../../db/index.js';

function mockPoolSequential(responses = []) {
  const orig = db.pool.query;
  let i = 0;
  db.pool.query = async (...args) => {
    const res = responses[i];
    i += 1;
    if (typeof res === 'function') return res(...args);
    return res;
  };
  return () => {
    db.pool.query = orig;
  };
}

function createRes() {
  return {
    code: 200,
    body: undefined,
    cookies: {},
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
    },
    cookie(name, val) {
      this.cookies[name] = val;
    },
  };
}

test('login succeeds after exporting translations', { concurrency: false }, async () => {
  const sessions = [
    {
      company_id: 0,
      branch_id: 1,
      department_id: 1,
      position_id: 1,
      position: 'P',
      senior_empid: null,
      employee_name: 'Emp0',
      user_level: 1,
      user_level_name: 'Admin',
      permission_list: '',
    },
  ];
  const restore = mockPoolSequential([
    [[{ moduleKey: 'm1', label: 'Module 1' }]],
    [[{ id: 1, empid: 1, password: 'hashed' }]],
    [sessions],
    [[]],
    [[]],
  ]);

  await exportTranslations(0);
  const res = createRes();
  await login({ body: { empid: 1, password: 'pw', companyId: 0 } }, res, () => {});
  restore();
  assert.equal(res.code, 200);
  await db.pool.end();
});

test('exports button and option labels from JSX', { concurrency: false }, async () => {
  const restore = mockPoolSequential([[[{ moduleKey: 'm1', label: 'Module 1' }]]]);
  const dir = path.join('src', 'erp.mgt.mn');
  fs.mkdirSync(dir, { recursive: true });
  const tempFile = path.join(dir, 'TempComponent.jsx');
  fs.writeFileSync(
    tempFile,
    `export default function T(){return (<div><button>Save</button><select><option>First Option</option></select></div>);}`,
  );
  const exportedPath = await exportTranslations(0);
  const data = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
  assert.equal(data['Save'], 'Save');
  assert.equal(data['First Option'], 'First Option');
  fs.unlinkSync(tempFile);
  restore();
  await db.pool.end();
});

test('exported texts include all headerMappings keys', { concurrency: false }, async () => {
  const restore = mockPoolSequential([[[{ moduleKey: 'm1', label: 'Module 1' }]]]);
  const exportedPath = await exportTranslations(0);
  const exported = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
  const headers = JSON.parse(
    fs.readFileSync('config/0/headerMappings.json', 'utf8'),
  );
  for (const key of Object.keys(headers)) {
    assert.ok(Object.prototype.hasOwnProperty.call(exported, key), key);
  }
  restore();
  await db.pool.end();
});
