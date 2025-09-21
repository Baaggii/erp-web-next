import test from 'node:test';
import assert from 'node:assert/strict';

import detectLocaleFromText from '../../src/erp.mgt.mn/utils/detectLocaleFromText.js';

test('detectLocaleFromText detects English text', () => {
  assert.equal(detectLocaleFromText('Hello world'), 'en');
});

test('detectLocaleFromText detects Mongolian Cyrillic text', () => {
  assert.equal(detectLocaleFromText('Сайн байна уу'), 'mn');
});

test('detectLocaleFromText returns null for numbers and symbols', () => {
  assert.equal(detectLocaleFromText('1234?!'), null);
});

test('detectLocaleFromText chooses the dominant script', () => {
  assert.equal(detectLocaleFromText('Hello Сайн байна'), 'mn');
  assert.equal(detectLocaleFromText('Hello hello Сайн'), 'en');
});

test('detectLocaleFromText handles nullish values', () => {
  assert.equal(detectLocaleFromText(undefined), null);
  assert.equal(detectLocaleFromText(null), null);
});
