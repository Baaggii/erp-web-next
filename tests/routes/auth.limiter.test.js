import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAuthAttemptLimiter } from '../../api-server/routes/authLimiter.js';

function createResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headersSent = false;
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  res.setHeader = () => {};
  res.json = function json(body) {
    this.body = body;
    this.headersSent = true;
    this.emit('finish');
    return this;
  };
  res.send = res.json;
  res.end = function end() {
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
        resolve({
          nextCalled,
          statusCode: res.statusCode,
          body: res.body,
        });
      }
    };
    res.on('finish', finish);
    limiter(req, res, () => {
      nextCalled = true;
      if (!res.headersSent) res.emit('finish');
    });
  });
}

test('auth limiter blocks after max attempts per ip + username key', async () => {
  const limiter = createAuthAttemptLimiter({ windowMs: 1_000, max: 2 });
  const req = { ip: '127.0.0.1', body: { username: 'alice' } };

  const first = await runLimiter(limiter, req, createResponse());
  assert.equal(first.statusCode, 200);
  assert.equal(first.nextCalled, true);

  const second = await runLimiter(limiter, req, createResponse());
  assert.equal(second.statusCode, 200);
  assert.equal(second.nextCalled, true);

  const third = await runLimiter(limiter, req, createResponse());
  assert.equal(third.statusCode, 429);
  assert.equal(third.nextCalled, false);
  assert.match(third.body?.message || '', /too many authentication attempts/i);
});

test('auth limiter counts empid fallback and isolates different users', async () => {
  const limiter = createAuthAttemptLimiter({ windowMs: 1_000, max: 1 });

  const firstEmp = await runLimiter(
    limiter,
    { ip: '10.0.0.2', body: { empid: 'E-100' } },
    createResponse(),
  );
  assert.equal(firstEmp.statusCode, 200);

  const secondEmp = await runLimiter(
    limiter,
    { ip: '10.0.0.2', body: { empid: 'E-100' } },
    createResponse(),
  );
  assert.equal(secondEmp.statusCode, 429);

  const otherEmp = await runLimiter(
    limiter,
    { ip: '10.0.0.2', body: { empid: 'E-101' } },
    createResponse(),
  );
  assert.equal(otherEmp.statusCode, 200);
});
