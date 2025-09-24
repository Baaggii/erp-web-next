import test from 'node:test';
import assert from 'node:assert/strict';

import { detectLang } from '../../api-server/utils/translationHelpers.js';

test('detectLang identifies Mongolian Cyrillic without diacritic letters', () => {
  assert.equal(detectLang('Сайн байна уу'), 'mn');
  assert.equal(detectLang('Байгууллага'), 'mn');
  assert.equal(detectLang('Боломж'), 'mn');
  assert.equal(detectLang('Тодорхойлолт'), 'mn');
  assert.equal(detectLang('Монгол Улс'), 'mn');
});

test('detectLang treats plain Russian Cyrillic as ru when Mongolian signals are absent', () => {
  assert.equal(detectLang('Онлайн сервис'), 'ru');
  assert.equal(detectLang('Добро пожаловать'), 'ru');
  assert.equal(detectLang('Файл'), 'ru');
});

test('detectLang recognises Mongolian question and command phrases', () => {
  assert.equal(detectLang('Та юу хийдэг вэ?'), 'mn');
  assert.equal(detectLang('Холбоо барих'), 'mn');
});
