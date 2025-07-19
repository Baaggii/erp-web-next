import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../../api-server/middlewares/errorHandler.js';

function mockRes() {
  return {
    statusCode: null,
    jsonData: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.jsonData = data; },
  };
}

test('errorHandler omits stack outside development', () => {
  const err = new Error('boom');
  const req = {};
  const res = mockRes();
  const orig = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  errorHandler(err, req, res, () => {});
  process.env.NODE_ENV = orig;
  assert.equal('stack' in res.jsonData, false);
});
