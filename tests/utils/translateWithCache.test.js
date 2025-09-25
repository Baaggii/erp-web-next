import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createCacheRecord } from '../../src/erp.mgt.mn/utils/translateWithCache.js';

describe('createCacheRecord', () => {
  it('replaces cache-prefixed sources with the provided fallback', () => {
    const record = createCacheRecord(
      { text: 'Hello', source: 'cache-ai' },
      'ai',
    );
    assert.ok(record);
    assert.equal(record.source, 'ai');
  });

  it('normalizes legacy cache tags to the fallback provider', () => {
    const record = createCacheRecord(
      { text: 'Hello', source: 'cache-indexedDB' },
      'ai',
    );
    assert.ok(record);
    assert.equal(record.source, 'ai');
  });

  it('respects non-cache sources', () => {
    const record = createCacheRecord(
      { text: 'Hello', source: 'OpenAI' },
      'ai',
    );
    assert.ok(record);
    assert.equal(record.source, 'OpenAI');
  });

  it('supports alternate provider fallbacks', () => {
    const record = createCacheRecord(
      { text: 'Hello', source: 'cache-google' },
      'google',
    );
    assert.ok(record);
    assert.equal(record.source, 'google');
  });
});
