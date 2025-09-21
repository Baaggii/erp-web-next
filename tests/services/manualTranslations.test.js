import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loadTranslations } from '../../api-server/services/manualTranslations.js';

const exportedPath = path.join('config', '0', 'exportedtexts.json');

function cleanup() {
  try { fs.unlinkSync(exportedPath); } catch {}
}

function cleanupDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {}
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

test('loadTranslations routes exported languages and queues undetermined strings', async () => {
  cleanup();
  const enDir = path.join('config', 'tenant_en');
  const mnDir = path.join('config', 'tenant_mn');
  const reviewDir = path.join('config', 'tenant_review');
  const enFile = path.join(enDir, 'exportedtexts.json');
  const mnFile = path.join(mnDir, 'exportedtexts.json');
  const reviewFile = path.join(reviewDir, 'exportedtexts.json');

  const cleanupTenants = () => {
    cleanupDir(enDir);
    cleanupDir(mnDir);
    cleanupDir(reviewDir);
  };

  cleanupTenants();

  fs.mkdirSync(enDir, { recursive: true });
  fs.writeFileSync(
    enFile,
    JSON.stringify(
      {
        translations: {
          shared: 'Submit',
          tooltipOnly: 'Hover here',
        },
      },
      null,
      2,
    ),
  );

  fs.mkdirSync(mnDir, { recursive: true });
  fs.writeFileSync(
    mnFile,
    JSON.stringify(
      {
        translations: {
          shared: 'Илгээх',
        },
      },
      null,
      2,
    ),
  );

  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(
    reviewFile,
    JSON.stringify(
      {
        translations: {
          ambiguous: '---',
        },
      },
      null,
      2,
    ),
  );

  try {
    const data = await loadTranslations();
    const sharedLocale = data.entries.find(
      (entry) => entry.type === 'locale' && entry.key === 'shared',
    );
    const sharedTooltip = data.entries.find(
      (entry) => entry.type === 'tooltip' && entry.key === 'shared',
    );
    assert(sharedLocale, 'shared locale entry exists');
    assert(sharedTooltip, 'shared tooltip entry exists');
    assert.equal(sharedLocale.values.en, 'Submit');
    assert.equal(sharedTooltip.values.en, 'Submit');
    assert.equal(sharedLocale.values.mn, 'Илгээх');
    assert.equal(sharedTooltip.values.mn, 'Илгээх');

    const tooltipOnly = data.entries.find(
      (entry) => entry.type === 'tooltip' && entry.key === 'tooltipOnly',
    );
    assert(tooltipOnly, 'tooltip only entry exists');
    assert.equal(tooltipOnly.values.en, 'Hover here');
    assert.equal(tooltipOnly.values.mn, '');

    const ambiguousLocale = data.entries.find(
      (entry) => entry.type === 'locale' && entry.key === 'ambiguous',
    );
    assert(ambiguousLocale, 'ambiguous locale entry exists');
    assert.equal(ambiguousLocale.values.en, '');
    assert.equal(ambiguousLocale.values.mn, '');
    assert.equal(ambiguousLocale.needsReview, true);
    assert(Array.isArray(ambiguousLocale.pendingReview));
    const pending = ambiguousLocale.pendingReview.find(
      (item) => item.value === '---',
    );
    assert(pending, 'ambiguous value queued for review');
    assert.equal(pending.reason, 'no_language_signal');

    const reviewQueue = Array.isArray(data.reviewQueue) ? data.reviewQueue : [];
    const reviewLocale = reviewQueue.find(
      (item) =>
        item.key === 'ambiguous' &&
        item.type === 'locale' &&
        item.value === '---',
    );
    assert(reviewLocale, 'ambiguous locale entry surfaced in review queue');
    assert.equal(reviewLocale.reason, 'no_language_signal');
    assert.equal(reviewLocale.source, 'exportedtexts');

    assert(data.languages.includes('en'));
    assert(data.languages.includes('mn'));
  } finally {
    cleanupTenants();
    cleanup();
  }
});
