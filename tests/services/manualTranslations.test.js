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
    JSON.stringify(
      {
        translations: {
          foo: 'Foo',
          nested: { bar: 'Bar' },
          plain: 'Plain Text',
        },
        meta: {
          foo: { module: 'pages/FooPage', context: 'button' },
          'nested.bar': { module: 'pages/NestedPage', context: 'label' },
        },
      },
      null,
      2,
    ),
  );
  try {
    const data = await loadTranslations();
    const localeFoo = data.entries.find((e) => e.type === 'locale' && e.key === 'foo');
    const tooltipFoo = data.entries.find((e) => e.type === 'tooltip' && e.key === 'foo');
    assert(localeFoo, 'locale foo entry exists');
    assert(tooltipFoo, 'tooltip foo entry exists');
    assert.equal(localeFoo.values.en, 'Foo');
    assert.equal(tooltipFoo.values.en, 'Foo');
    assert.equal(localeFoo.module, 'pages/FooPage');
    assert.equal(localeFoo.context, 'button');
    assert.equal(tooltipFoo.module, 'pages/FooPage');
    assert.equal(tooltipFoo.context, 'button');
    const otherLang = data.languages.find((l) => l !== 'en');
    if (otherLang) {
      assert.equal(localeFoo.values[otherLang], '');
      assert.equal(tooltipFoo.values[otherLang], '');
    }
    const nestedLocale = data.entries.find((e) => e.type === 'locale' && e.key === 'nested.bar');
    const nestedTooltip = data.entries.find((e) => e.type === 'tooltip' && e.key === 'nested.bar');
    assert(nestedLocale, 'nested locale entry exists');
    assert(nestedTooltip, 'nested tooltip entry exists');
    assert.equal(nestedLocale.values.en, 'Bar');
    assert.equal(nestedTooltip.values.en, 'Bar');
    assert.equal(nestedLocale.module, 'pages/NestedPage');
    assert.equal(nestedLocale.context, 'label');
    assert.equal(nestedTooltip.module, 'pages/NestedPage');
    assert.equal(nestedTooltip.context, 'label');
    const plainLocale = data.entries.find((e) => e.type === 'locale' && e.key === 'plain');
    assert(plainLocale, 'plain locale entry exists');
    assert.equal(plainLocale.module, '');
    assert.equal(plainLocale.context, '');
  } finally {
    cleanup();
  }
});
