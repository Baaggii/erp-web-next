import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loadTranslations } from '../../api-server/services/manualTranslations.js';

const exportedPath = path.join('config', '0', 'exportedtexts.json');

function cleanup() {
  try { fs.unlinkSync(exportedPath); } catch {}
}

test('exported texts are merged into manual translations', async () => {
  cleanup();
  fs.mkdirSync(path.dirname(exportedPath), { recursive: true });
  fs.writeFileSync(
    exportedPath,
    JSON.stringify({ foo: 'Foo', nested: { bar: 'Bar' } }, null, 2),
  );
  try {
    const data = await loadTranslations();
    const foo = data.entries.find((e) => e.type === 'exported' && e.key === 'foo');
    assert(foo, 'foo entry exists');
    assert.equal(foo.values.en, 'Foo');
    const otherLang = data.languages.find((l) => l !== 'en');
    if (otherLang) assert.equal(foo.values[otherLang], '');
    const nested = data.entries.find((e) => e.type === 'exported' && e.key === 'nested.bar');
    assert(nested, 'nested entry exists');
    assert.equal(nested.values.en, 'Bar');
  } finally {
    cleanup();
  }
});
