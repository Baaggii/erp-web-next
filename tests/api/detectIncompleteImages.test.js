import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { detectIncompleteImages, fixIncompleteImages, checkUploadedImages, commitUploadedImages } from '../../api-server/services/transactionImageService.js';
import * as db from '../../db/index.js';

function mockPool(handler) {
  const orig = db.pool.query;
  db.pool.query = handler;
  return () => { db.pool.query = orig; };
}

const cfgPath = path.join(process.cwd(), 'config', 'transactionForms.json');
const baseDir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');

await test('detectIncompleteImages finds and fixes files', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });
  const file = path.join(baseDir, 'abc12345.jpg');
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    test_num: 'abc12345',
    label_field: 'num001',
    trtype: 't1',
    TransType: 'A',
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql)) return [[{ Field: 'test_num' }, { Field: 'label_field' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: { imagenameField: ['label_field'], transactionTypeValue: 'A' },
      },
    }),
  );

  const { list, hasMore } = await detectIncompleteImages(1);
  assert.equal(hasMore, false);
  assert.equal(list.length, 1);
  assert.ok(list[0].newName.includes('num001'));

  const count = await fixIncompleteImages(list);
  assert.equal(count, 1);

  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't1', 'a'),
  );
  assert.ok(exists.some((f) => f.includes('num001')));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages scans entire folder', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'a_b_c_d_e.jpg'), 'x');
  await fs.writeFile(path.join(dir, 'unique123.jpg'), 'x');

  const row = {
    id: 1,
    num_field: 'unique123',
    label_field: 'img006',
    UITrtype: 't1',
    TransType: '4001',
  };
  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'num_field' },
        { Field: 'label_field' },
        { Field: 'UITrtype' },
        { Field: 'TransType' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: {
          imagenameField: ['label_field'],
          transactionTypeField: 'TransType',
          transactionTypeValue: '4001',
        },
      },
    }),
  );

  const { list } = await detectIncompleteImages(1, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].newName, 'img006_unique123.jpg');

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('checkUploadedImages handles object names', async () => {
  const restoreDb = mockPool(async () => [[]]);
  const { list, summary } = await checkUploadedImages([], [{ name: 'abc.jpg' }]);
  assert.equal(summary.totalFiles, 1);
  assert.equal(list.length, 0);
  restoreDb();
});

await test('checkUploadedImages renames on upload', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  const tmp = path.join(process.cwd(), 'uploads', 'tmp', 'abc12345.jpg');
  await fs.writeFile(tmp, 'x');

  const row = {
    id: 1,
    test_num: 'abc12345',
    label_field: 'num002',
    trtype: 't1',
    TransType: 'A',
  };
  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql)) return [[{ Field: 'test_num' }, { Field: 'label_field' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: { imagenameField: ['label_field'], transactionTypeValue: 'A' },
      },
    }),
  );

  const { list, summary } = await checkUploadedImages([{ originalname: 'abc12345.jpg', path: tmp }]);
  assert.equal(summary.processed, 1);
  assert.equal(list.length, 1);
  assert.ok(list[0].newName.includes('num002'));

  const uploaded = await commitUploadedImages(list);
  assert.equal(uploaded, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't1', 'a'),
  );
  assert.ok(exists.some((f) => f.includes('num002')));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages fallback naming', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'xyz98765.jpg');
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    test_num: 'xyz98765',
    bmtr_orderid: 'o100',
    bmtr_orderdid: 'd200',
    trtype: 't2',
    TransType: 'B',
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[{ Field: 'test_num' }, { Field: 'bmtr_orderid' }, { Field: 'bmtr_orderdid' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(cfgPath, JSON.stringify({ transactions_test: { default: {} } }));

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.ok(list[0].newName.includes('o100_d200_b_t2'));

  const moved = await fixIncompleteImages(list);
  assert.equal(moved, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't2', 'b'),
  );
  assert.ok(exists.some((f) => f.includes('o100_d200_b_t2')));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages handles timestamped names without trtype', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const ts = 1754112726584;
  const file = path.join(dir, `300021_300021_4001_${ts}_c2kene.jpg`);
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    z_mat_code: '300021',
    sp_primary_code: '300021',
    TransType: '4001',
    UITrtype: 't3',
    label_field: 'img003',
    created_at: new Date(ts),
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'z_mat_code' },
        { Field: 'sp_primary_code' },
        { Field: 'TransType' },
        { Field: 'UITrtype' },
        { Field: 'created_at' },
        { Field: 'label_field' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: {
          imagenameField: ['label_field'],
          transactionTypeField: 'TransType',
          transactionTypeValue: '4001',
        },
      },
    }),
  );

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.equal(list[0].newName, 'img003.jpg');

  const moved = await fixIncompleteImages(list);
  assert.equal(moved, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't3', '4001'),
  );
  assert.ok(exists.includes('img003.jpg'));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('checkUploadedImages handles timestamped names', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  const ts = 1754112726584;
  const tmp = path.join(process.cwd(), 'uploads', 'tmp', `300021_300021_4001_${ts}_c2kene.jpg`);
  await fs.writeFile(tmp, 'x');

  const row = {
    id: 1,
    z_mat_code: '300021',
    sp_primary_code: '300021',
    TransType: '4001',
    UITrtype: 't3',
    label_field: 'img004',
    created_at: new Date(ts),
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'z_mat_code' },
        { Field: 'sp_primary_code' },
        { Field: 'TransType' },
        { Field: 'UITrtype' },
        { Field: 'created_at' },
        { Field: 'label_field' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: {
          imagenameField: ['label_field'],
          transactionTypeField: 'TransType',
          transactionTypeValue: '4001',
        },
      },
    }),
  );

  const { list, summary } = await checkUploadedImages([
    { originalname: path.basename(tmp), path: tmp },
  ]);
  assert.equal(summary.processed, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].newName, 'img004.jpg');

  const uploaded = await commitUploadedImages(list);
  assert.equal(uploaded, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't3', '4001'),
  );
  assert.ok(exists.includes('img004.jpg'));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages handles UUID with numeric suffix', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'A5E68912-2218-41BD-BB11-E4810BB30C96-4.jpg');
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    test_num: 'A5E68912-2218-41BD-BB11-E4810BB30C96',
    label_field: 'img005',
    trtype: 't4',
    TransType: 'C',
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[{ Field: 'test_num' }, { Field: 'label_field' }]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      transactions_test: {
        default: { imagenameField: ['label_field'], transactionTypeValue: 'C' },
      },
    }),
  );

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.equal(
    list[0].newName,
    'img005_A5E68912-2218-41BD-BB11-E4810BB30C96-4.jpg',
  );

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});
