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

test('login succeeds after exporting translations', async () => {
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

test('dropdown items and button labels exported', async () => {
  const tmpFile = path.join('src', 'erp.mgt.mn', 'TmpTranslation.jsx');
  fs.writeFileSync(
    tmpFile,
    `import { t } from 'i18next';
export default function Tmp() {
  return (
    <div>
      <button>Test Button</button>
      <label>Test Label</label>
      <select>
        <option>Test Option</option>
        <option>{t('wrapped')}</option>
      </select>
      <button>{t('Wrapped Button')}</button>
    </div>
  );
}
`,
  );

  const restore = mockPoolSequential([[[{ moduleKey: 'm1', label: 'Module 1' }]]]);
  await exportTranslations(0);
  const exportedPath = path.join('config', '0', 'exportedtexts.json');
  const exported = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
  restore();
  fs.unlinkSync(tmpFile);
  assert.equal(exported['Test Button'], 'Test Button');
  assert.equal(exported['Test Option'], 'Test Option');
  assert.equal(exported['Test Label'], 'Test Label');
  await db.pool.end();
});

test('deeply nested header mappings are flattened', async () => {
  const headerMappingsPath = path.join('config', '0', 'headerMappings.json');
  const original = fs.readFileSync(headerMappingsPath, 'utf8');
  const nestedMappings = {
    root: {
      title: { en: 'Root Title' },
      items: [
        {
          name: { en: 'Item Name' },
          children: [
            { label: { en: 'Child1' } },
            { label: { en: 'Child2' }, more: [{ deep: { en: 'Deep' } }] },
          ],
        },
      ],
    },
  };
  fs.writeFileSync(headerMappingsPath, JSON.stringify(nestedMappings, null, 2));

  const restore = mockPoolSequential([[[{ moduleKey: 'm1', label: 'Module 1' }]]]);
  try {
    await exportTranslations(0);
  } finally {
    restore();
  }
  const exportedPath = path.join('config', '0', 'exportedtexts.json');
  const exported = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
  assert.equal(exported.root.title, 'Root Title');
  assert.equal(exported.root.items[0].name, 'Item Name');
  assert.equal(exported.root.items[0].children[1].more[0].deep, 'Deep');
  fs.writeFileSync(headerMappingsPath, original);
  fs.unlinkSync(exportedPath);
  await db.pool.end();
});
