import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { listTransactionNames } from '../../api-server/services/transactionFormConfig.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';

async function withTempFile(companyId = 0) {
  const file = tenantConfigPath('transactionForms.json', companyId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const orig = await fs.readFile(file, 'utf8');
    return { file, restore: () => fs.writeFile(file, orig) };
  } catch {
    return { file, restore: () => fs.rm(file, { force: true }) };
  }
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

await test('listTransactionNames enforces workplace position resolution', async () => {
  const companyId = 9090;
  const ctx = await withTempFile(companyId);
  await fs.writeFile(
    ctx.file,
    JSON.stringify({
      tbl: {
        Sample: {
          allowedPositions: [50],
          procedures: ['work_proc'],
        },
      },
    }),
  );

  try {
    const missingMapping = await listTransactionNames(
      { workplaceId: 2, positionId: 50 },
      companyId,
    );
    assert.equal(missingMapping.names.Sample, undefined);

    const disallowedMapping = await listTransactionNames(
      {
        workplaceId: 2,
        positionId: 999,
        workplacePositions: [{ workplace_id: 2, position_id: 70 }],
      },
      companyId,
    );
    assert.equal(disallowedMapping.names.Sample, undefined);

    const allowedMapping = await listTransactionNames(
      {
        workplaceId: 2,
        positionId: 999,
        workplacePositions: [{ workplace_id: 2, position_id: 50 }],
      },
      companyId,
    );
    assert.ok(allowedMapping.names.Sample);

    const employmentAllowed = await listTransactionNames({ positionId: 50 }, companyId);
    assert.ok(employmentAllowed.names.Sample);

    const employmentDenied = await listTransactionNames({ positionId: 70 }, companyId);
    assert.equal(employmentDenied.names.Sample, undefined);
  } finally {
    await ctx.restore();
  }
});
