import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setCompanyModuleLogId,
  setUserCompanyLogId,
} from '../../api-server/routes/logRecordId.js';

function createRes() {
  return { locals: {} };
}

test('company_modules sets logRecordId when companyId is 0', () => {
  const req = { body: { companyId: 0, moduleKey: 'm' } };
  const res = createRes();
  setCompanyModuleLogId(req, res, () => {});
  assert.equal(res.locals.logRecordId, '0-m');
});

test('user_companies routes set logRecordId when companyId is 0', () => {
  const req = { body: { empid: 0, companyId: 0 } };
  const res = createRes();
  setUserCompanyLogId(req, res, () => {});
  assert.equal(res.locals.logRecordId, '0-0');
});
