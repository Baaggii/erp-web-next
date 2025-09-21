import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createManualTranslationsLimiter } from '../../api-server/routes/manual_translationsLimiter.js';

function createResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headersSent = false;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.setHeader = () => {};
  res.json = function (body) {
    this.body = body;
    this.headersSent = true;
    this.emit('finish');
    return this;
  };
  res.send = res.json;
  res.end = function () {
    this.headersSent = true;
    this.emit('finish');
  };
  return res;
}

function runLimiter(limiter, req, res) {
  return new Promise((resolve) => {
    let nextCalled = false;
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve({ nextCalled, statusCode: res.statusCode });
      }
    };
    res.on('finish', finish);
    limiter(req, res, () => {
      nextCalled = true;
      if (!res.headersSent) {
        res.emit('finish');
      }
    });
  });
}

await test('manual translations limiter skips successful requests by default', async () => {
  const limiter = createManualTranslationsLimiter({ windowMs: 1000, max: 1 });
  const req = { ip: '127.0.0.1', user: { id: 'user-1', companyId: 'co-1' } };

  const res1 = createResponse();
  const result1 = await runLimiter(limiter, req, res1);
  assert.equal(result1.statusCode, 200);
  assert.equal(result1.nextCalled, true);

  const res2 = createResponse();
  const result2 = await runLimiter(limiter, req, res2);
  assert.equal(result2.statusCode, 200);
  assert.equal(result2.nextCalled, true);
});

await test('manual translations limiter tracks counts per authenticated user', async () => {
  const limiter = createManualTranslationsLimiter({
    windowMs: 1000,
    max: 2,
    skipSuccessfulRequests: false,
  });

  const makeReq = (id) => ({ ip: '192.168.0.1', user: { id, companyId: 'co-7' } });

  const first = await runLimiter(limiter, makeReq('user-a'), createResponse());
  assert.equal(first.statusCode, 200);
  assert.equal(first.nextCalled, true);

  const second = await runLimiter(limiter, makeReq('user-a'), createResponse());
  assert.equal(second.statusCode, 200);
  assert.equal(second.nextCalled, true);

  const third = await runLimiter(limiter, makeReq('user-a'), createResponse());
  assert.equal(third.statusCode, 429);
  assert.equal(third.nextCalled, false);

  const other = await runLimiter(limiter, makeReq('user-b'), createResponse());
  assert.equal(other.statusCode, 200);
  assert.equal(other.nextCalled, true);
});
