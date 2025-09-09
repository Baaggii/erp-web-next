import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import { listTransactionNames } from '../../api-server/services/transactionFormConfig.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';

function withTempFile(companyId = 0) {
  const file = tenantConfigPath('transactionForms.json', companyId);
  return fs
    .readFile(file, 'utf8')
    .then((orig) => ({ file, restore: () => fs.writeFile(file, orig) }))
    .catch(() => ({ file, restore: () => fs.rm(file, { force: true }) }));
}

function collectProcedures(forms) {
  const set = new Set();
  Object.values(forms).forEach((info) => {
    (info.procedures || []).forEach((p) => set.add(p));
  });
  return Array.from(set).sort();
}

await test('listTransactionNames filters procedures by companyId', async () => {
  const base = await withTempFile(0);
  const tenant = await withTempFile(77);
  await fs.writeFile(
    base.file,
    JSON.stringify({ tbl: { Base: { procedures: ['baseProc'] } } })
  );
  await fs.writeFile(
    tenant.file,
    JSON.stringify({ tbl: { Tenant: { procedures: ['tenantProc'] } } })
  );
  const { names: baseForms } = await listTransactionNames({}, 0);
  const { names: tenantForms } = await listTransactionNames({}, 77);
  assert.deepEqual(collectProcedures(baseForms), ['baseProc']);
  assert.deepEqual(collectProcedures(tenantForms), ['tenantProc']);
  await tenant.restore();
  await base.restore();
});
