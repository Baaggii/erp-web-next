import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';

import {
  setFormConfig,
  listTransactionNames,
  deleteFormConfig,
} from '../../api-server/services/transactionFormConfig.js';

const COMPANY_ID = 987654;
const TABLE = 'temp_scope_table';
const NAME = 'Temporary Scope Form';
const MODULE_KEY = 'pos_transactions';

async function cleanup() {
  await deleteFormConfig(TABLE, NAME, COMPANY_ID);
  await fs.rm(path.join(process.cwd(), 'config', String(COMPANY_ID)), {
    recursive: true,
    force: true,
  });
}

test('listTransactionNames includes temporary forms when user right and workplace match', async (t) => {
  await cleanup();
  t.after(cleanup);

  await setFormConfig(
    TABLE,
    NAME,
    {
      moduleKey: MODULE_KEY,
      allowedBranches: [123],
      allowedDepartments: [456],
      allowedUserRights: ['GEN_RIGHT'],
      allowedWorkplaces: ['GEN_WORK'],
      temporaryAllowedBranches: [999],
      temporaryAllowedDepartments: [888],
      temporaryAllowedUserRights: ['TEMP_RIGHT'],
      temporaryAllowedWorkplaces: ['TEMP_WORK'],
      supportsTemporarySubmission: true,
    },
    {},
    COMPANY_ID,
  );

  const { names } = await listTransactionNames(
    {
      moduleKey: MODULE_KEY,
      branchId: '999',
      departmentId: '888',
      userRightId: 'TEMP_RIGHT',
      workplaceId: 'TEMP_WORK',
    },
    COMPANY_ID,
  );

  assert.ok(
    names[NAME],
    'temporary configuration should be returned when temporary access matches',
  );
});
