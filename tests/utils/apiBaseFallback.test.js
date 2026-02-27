import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VITE_API_BASE = '';

const { buildApiEndpointCandidates, fetchWithApiFallback } = await import('../../src/erp.mgt.mn/utils/apiBase.js');

test('buildApiEndpointCandidates returns /api and root fallback', () => {
  assert.deepEqual(buildApiEndpointCandidates('/auth/me'), ['/api/auth/me', '/auth/me']);
});

test('fetchWithApiFallback retries on 404', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url === '/api/auth/me') return { status: 404 };
    return { status: 200 };
  };
  const res = await fetchWithApiFallback(fakeFetch, '/auth/me');
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['/api/auth/me', '/auth/me']);
});
