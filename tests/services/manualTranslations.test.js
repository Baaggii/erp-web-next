import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loadTranslations } from '../../api-server/services/manualTranslations.js';

const TEST_TENANT_DIR = path.join('config', 'manualTranslationsTest');
const exportedPath = path.join(TEST_TENANT_DIR, 'exportedtexts.json');
const enLocalePath = path.join('src', 'erp.mgt.mn', 'locales', 'en.json');
const mnLocalePath = path.join('src', 'erp.mgt.mn', 'locales', 'mn.json');
const enTooltipPath = path.join(
  'src',
  'erp.mgt.mn',
  'locales',
  'tooltips',
  'en.json',
);
const mnTooltipPath = path.join(
  'src',
  'erp.mgt.mn',
  'locales',
  'tooltips',
  'mn.json',
);

function cleanup() {
  try {
    fs.rmSync(TEST_TENANT_DIR, { recursive: true, force: true });
  } catch {}
}

test('exported texts are merged into manual translations', { concurrency: false }, async () => {
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
    assert.equal(localeFoo, undefined);
    assert.equal(tooltipFoo, undefined);
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

test('exported texts detect languages and respect existing entries', { concurrency: false }, async () => {
  cleanup();
  fs.mkdirSync(path.dirname(exportedPath), { recursive: true });

  const englishKey = 'manualTranslationsTest.english';
  const mongolianKey = 'manualTranslationsTest.mongolian';
  const conflictKey = 'manualTranslationsTest.conflict';

  const originalEnLocale = fs.readFileSync(enLocalePath, 'utf8');
  const originalMnLocale = fs.readFileSync(mnLocalePath, 'utf8');
  const originalEnTooltip = fs.readFileSync(enTooltipPath, 'utf8');
  const originalMnTooltip = fs.readFileSync(mnTooltipPath, 'utf8');

  try {
    const enLocale = JSON.parse(originalEnLocale);
    const mnLocale = JSON.parse(originalMnLocale);
    const enTooltip = JSON.parse(originalEnTooltip);
    const mnTooltip = JSON.parse(originalMnTooltip);

    enLocale[conflictKey] = 'Existing English Locale';
    mnLocale[conflictKey] = 'Оригинал Монгол Locale';
    enTooltip[conflictKey] = 'Existing English Tooltip';
    mnTooltip[conflictKey] = 'Оригинал Монгол Tooltip';

    for (const key of [englishKey, mongolianKey]) {
      delete enLocale[key];
      delete mnLocale[key];
      delete enTooltip[key];
      delete mnTooltip[key];
    }

    fs.writeFileSync(enLocalePath, JSON.stringify(enLocale, null, 2));
    fs.writeFileSync(mnLocalePath, JSON.stringify(mnLocale, null, 2));
    fs.writeFileSync(enTooltipPath, JSON.stringify(enTooltip, null, 2));
    fs.writeFileSync(mnTooltipPath, JSON.stringify(mnTooltip, null, 2));

    fs.writeFileSync(
      exportedPath,
      JSON.stringify(
        {
          translations: {
            [englishKey]: 'Sample English Phrase',
            [mongolianKey]: 'Санхүүгийн тайлан',
            [conflictKey]: 'Should Not Override',
          },
        },
        null,
        2,
      ),
    );

    const data = await loadTranslations();

    const englishLocale = data.entries.find(
      (e) => e.type === 'locale' && e.key === englishKey,
    );
    const englishTooltip = data.entries.find(
      (e) => e.type === 'tooltip' && e.key === englishKey,
    );
    assert(englishLocale, 'english locale entry exists');
    assert(englishTooltip, 'english tooltip entry exists');
    assert.equal(englishLocale.values.en, 'Sample English Phrase');
    assert.equal(englishTooltip.values.en, 'Sample English Phrase');
    assert.equal(englishLocale.values.mn, '');
    assert.equal(englishTooltip.values.mn, '');

    const mongolianLocale = data.entries.find(
      (e) => e.type === 'locale' && e.key === mongolianKey,
    );
    const mongolianTooltip = data.entries.find(
      (e) => e.type === 'tooltip' && e.key === mongolianKey,
    );
    assert(mongolianLocale, 'mongolian locale entry exists');
    assert(mongolianTooltip, 'mongolian tooltip entry exists');
    assert.equal(mongolianLocale.values.mn, 'Санхүүгийн тайлан');
    assert.equal(mongolianTooltip.values.mn, 'Санхүүгийн тайлан');
    assert.equal(mongolianLocale.values.en, '');
    assert.equal(mongolianTooltip.values.en, '');

    const conflictLocale = data.entries.find(
      (e) => e.type === 'locale' && e.key === conflictKey,
    );
    const conflictTooltip = data.entries.find(
      (e) => e.type === 'tooltip' && e.key === conflictKey,
    );
    assert(conflictLocale, 'conflict locale entry exists');
    assert(conflictTooltip, 'conflict tooltip entry exists');
    assert.equal(conflictLocale.values.en, 'Existing English Locale');
    assert.equal(conflictTooltip.values.en, 'Existing English Tooltip');
    assert.equal(conflictLocale.values.mn, 'Оригинал Монгол Locale');
    assert.equal(conflictTooltip.values.mn, 'Оригинал Монгол Tooltip');
  } finally {
    cleanup();
    fs.writeFileSync(enLocalePath, originalEnLocale);
    fs.writeFileSync(mnLocalePath, originalMnLocale);
    fs.writeFileSync(enTooltipPath, originalEnTooltip);
    fs.writeFileSync(mnTooltipPath, originalMnTooltip);
  }
});

test('non-meaningful exported translations are ignored', { concurrency: false }, async () => {
  cleanup();
  fs.mkdirSync(path.dirname(exportedPath), { recursive: true });

  const meaninglessKey = 'Manual.Translations_Test';
  const meaninglessValue = 'manual translations test';

  fs.writeFileSync(
    exportedPath,
    JSON.stringify(
      {
        translations: {
          [meaninglessKey]: meaninglessValue,
        },
      },
      null,
      2,
    ),
  );

  try {
    const data = await loadTranslations();
    const localeEntry = data.entries.find((e) => e.type === 'locale' && e.key === meaninglessKey);
    const tooltipEntry = data.entries.find((e) => e.type === 'tooltip' && e.key === meaninglessKey);
    assert.equal(localeEntry, undefined);
    assert.equal(tooltipEntry, undefined);
  } finally {
    cleanup();
  }
});
