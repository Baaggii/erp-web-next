import test from 'node:test';
import assert from 'node:assert/strict';
import { setCompanyModuleLogId } from '../../api-server/routes/logRecordId.js';

function createRes() {
  return { locals: {} };
}

test('company_modules sets logRecordId when companyId is 0', () => {
  const req = { body: { companyId: 0, moduleKey: 'm' } };
  const res = createRes();
  setCompanyModuleLogId(req, res, () => {});
  assert.equal(res.locals.logRecordId, '0-m');
});

