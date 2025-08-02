import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import {
  detectIncompleteImages,
  fixIncompleteImages,
  checkUploadedImages,
  commitUploadedImages,
  detectIncompleteFromNames,
} from '../../api-server/services/transactionImageService.js';
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
  const restoreDb = mockPool(async (sql, params) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'num_field' },
        { Field: 'label_field' },
        { Field: 'UITrtype' },
        { Field: 'TransType' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) {
      if (params && params[0] && params[0].includes('unique123')) return [[row]];
      return [[]];
    }
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

await test('detectIncompleteImages skips files with transaction codes', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const ts = 1754112726584;
  await fs.writeFile(path.join(dir, `uuid12345.jpg`), 'x');
  await fs.writeFile(
    path.join(dir, `t1_4001_uuid12345_${ts}_abcd12.jpg`),
    'x',
  );

  const row = {
    id: 1,
    num_field: 'uuid12345',
    label_field: 'img010',
    UITrtype: 't1',
    TransType: '4001',
  };
  const restoreDb = mockPool(async (sql, params) => {
    if (/SELECT UITrtype, UITransType FROM code_transaction/.test(sql))
      return [[{ UITrtype: 't1', UITransType: '4001' }]];
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'num_field' },
        { Field: 'label_field' },
        { Field: 'UITrtype' },
        { Field: 'TransType' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) {
      if (params && params[0] && params[0].includes('uuid12345')) return [[row]];
      return [[]];
    }
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

  const { list } = await detectIncompleteImages(1, 10);
  assert.equal(list.length, 1);
  assert.equal(list[0].currentName, 'uuid12345.jpg');

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

await test('checkUploadedImages skips files with transaction codes', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'uploads', 'tmp'), { recursive: true });
  const ts = 1754112726584;
  const tmp1 = path.join(process.cwd(), 'uploads', 'tmp', 'uuid12345.jpg');
  const tmp2 = path.join(
    process.cwd(),
    'uploads',
    'tmp',
    `t1_4001_uuid12345_${ts}_abcd12.jpg`,
  );
  await fs.writeFile(tmp1, 'x');
  await fs.writeFile(tmp2, 'x');

  const row = {
    id: 1,
    num_field: 'uuid12345',
    label_field: 'img011',
    UITrtype: 't1',
    TransType: '4001',
  };
  const restoreDb = mockPool(async (sql, params) => {
    if (/SELECT UITrtype, UITransType FROM code_transaction/.test(sql))
      return [[{ UITrtype: 't1', UITransType: '4001' }]];
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'num_field' },
        { Field: 'label_field' },
        { Field: 'UITrtype' },
        { Field: 'TransType' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) {
      if (params && params[0] && params[0].includes('uuid12345')) return [[row]];
      return [[]];
    }
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
    { originalname: 'uuid12345.jpg', path: tmp1 },
    { originalname: `t1_4001_uuid12345_${ts}_abcd12.jpg`, path: tmp2 },
  ]);
  assert.equal(summary.processed, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].originalName, 'uuid12345.jpg');

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
  assert.equal(list[0].newName, `img003__${ts}_c2kene.jpg`);

  const moved = await fixIncompleteImages(list);
  assert.equal(moved, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't3', '4001'),
  );
  assert.ok(exists.includes(`img003__${ts}_c2kene.jpg`));

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages ignores timestamp mismatch when searching', async () => {
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
    label_field: 'img009',
    created_at: new Date(ts - 3 * 86400 * 1000),
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
  assert.equal(list[0].newName, `img009__${ts}_c2kene.jpg`);

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages finds bmtr_pmid files by trans type and date range', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(
    process.cwd(),
    'uploads',
    'txn_images',
    'transactions_test',
  );
  await fs.mkdir(dir, { recursive: true });
  const ts = 1754119571573;
  const file = path.join(dir, `303204_303204_4001_${ts}_4rpenn.jpg`);
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    bmtr_pmid: '303204',
    sp_primary_code: '303204',
    TransType: '4001',
    UITrtype: 't9',
    label_field: 'img011',
    created_at: new Date(ts - 36 * 3600 * 1000),
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SELECT UITrtype, UITransType FROM code_transaction/.test(sql))
      return [[{ UITrtype: 't9', UITransType: '4001' }]];
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'bmtr_pmid' },
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
          dateField: ['created_at'],
        },
      },
    }),
  );

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.equal(list[0].newName, `img011__${ts}_4rpenn.jpg`);

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
  assert.equal(list[0].newName, `img004__${ts}_c2kene.jpg`);

  const uploaded = await commitUploadedImages(list);
  assert.equal(uploaded, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't3', '4001'),
  );
  assert.ok(exists.includes(`img004__${ts}_c2kene.jpg`));

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

await test('detectIncompleteImages handles hyphenated ID with leading dash', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, '-CGRA-OXSB-PSBZ-FMEY-8.jpg');
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    test_num: 'CGRA-OXSB-PSBZ-FMEY',
    label_field: 'img006',
    trtype: 't5',
    TransType: 'D',
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
        default: { imagenameField: ['label_field'], transactionTypeValue: 'D' },
      },
    }),
  );

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.equal(
    list[0].newName,
    'img006_CGRA-OXSB-PSBZ-FMEY-8.jpg',
  );

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages renames when trtype is missing', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, '-CGRA-OXSB-PSBZ-FMEY-8.jpg');
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    test_num: 'CGRA-OXSB-PSBZ-FMEY',
    z_mat_code: '111',
    bmtr_orderid: 'o1',
    bmtr_orderdid: 'd1',
    TransType: 'X',
  };

  const restoreDb = mockPool(async (sql) => {
    if (/SHOW TABLES LIKE/.test(sql)) return [[{ t: 'transactions_test' }]];
    if (/SHOW COLUMNS FROM/.test(sql))
      return [[
        { Field: 'test_num' },
        { Field: 'z_mat_code' },
        { Field: 'bmtr_orderid' },
        { Field: 'bmtr_orderdid' },
        { Field: 'TransType' },
      ]];
    if (/FROM `transactions_test`/.test(sql)) return [[row]];
    return [[]];
  });

  const origCfg = await fs.readFile(cfgPath, 'utf8').catch(() => '{}');
  await fs.writeFile(cfgPath, JSON.stringify({ transactions_test: { default: {} } }));

  const { list } = await detectIncompleteImages(1);
  assert.equal(list.length, 1);
  assert.equal(list[0].newName, '111_o1_d1_x_x_CGRA-OXSB-PSBZ-FMEY-8.jpg');

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('detectIncompleteImages handles extra unique before timestamp', async () => {
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
  const dir = path.join(process.cwd(), 'uploads', 'txn_images', 'transactions_test');
  await fs.mkdir(dir, { recursive: true });
  const ts = 1753974108927;
  const file = path.join(
    dir,
    '120180002323_120180002323_4001_ydzfh-sdang-cxfxb-kajww_akihl-zukov-ulioe-fhnde_1753974108927_oge4m7.jpg',
  );
  await fs.writeFile(file, 'x');

  const row = {
    id: 1,
    z_mat_code: '120180002323',
    sp_primary_code: '120180002323',
    TransType: '4001',
    UITrtype: 't6',
    label_field: 'img007',
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
  assert.equal(
    list[0].newName,
    `img007_ydzfh-sdang-cxfxb-kajww_akihl-zukov-ulioe-fhnde__${ts}_oge4m7.jpg`,
  );

  const moved = await fixIncompleteImages(list);
  assert.equal(moved, 1);
  const exists = await fs.readdir(
    path.join(process.cwd(), 'uploads', 'txn_images', 't6', '4001'),
  );
  assert.ok(
    exists.includes(
      `img007_ydzfh-sdang-cxfxb-kajww_akihl-zukov-ulioe-fhnde__${ts}_oge4m7.jpg`,
    ),
  );

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
  await fs.rm(path.join(process.cwd(), 'uploads'), { recursive: true, force: true });
});

await test('checkUploadedImages handles names array', async () => {
  const row = {
    id: 1,
    test_num: '2c589c0f-369a-4827-8b4c-fc5aeaf88a1c',
    label_field: 'img008',
    trtype: 't7',
    TransType: 'E',
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
        default: { imagenameField: ['label_field'], transactionTypeValue: 'E' },
      },
    }),
  );

  const { list, summary } = await checkUploadedImages([], [
    '800688-2c589c0f-369a-4827-8b4c-fc5aeaf88a1c-20.jpg',
  ]);
  assert.equal(summary.processed, 1);
  assert.equal(list.length, 1);
  assert.equal(
    list[0].newName,
    'img008_2c589c0f-369a-4827-8b4c-fc5aeaf88a1c-20.jpg',
  );

  restoreDb();
  await fs.writeFile(cfgPath, origCfg);
});

await test('detectIncompleteFromNames reports unflagged reasons', async () => {
  const restoreDb = mockPool(async (sql) => {
    if (/SELECT UITrtype, UITransType FROM code_transaction/.test(sql)) {
      return [[{ UITrtype: 't1', UITransType: '4001' }]];
    }
    return [[]];
  });
  const { list, skipped, summary } = await detectIncompleteFromNames([
    'a.jpg',
    '12345678-1234-1234-1234-123456789abc_t1_4001.jpg',
  ]);
  assert.equal(list.length, 0);
  assert.equal(skipped.length, 2);
  assert.equal(summary.skipped, 2);
  restoreDb();
});
