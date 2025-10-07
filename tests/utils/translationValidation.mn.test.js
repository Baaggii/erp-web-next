import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateTranslationCandidate } from '../../utils/translationValidation.js';

test('flags Mongolian translations that still include Latin script', () => {
  const result = evaluateTranslationCandidate({
    candidate: 'Орлого report',
    base: 'Revenue report',
    lang: 'mn',
  });
  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('contains_latin_script'));
});

test('rejects Mongolian outputs without vowels', () => {
  const result = evaluateTranslationCandidate({
    candidate: 'Брхт',
    base: 'Detailed balance',
    lang: 'mn',
  });
  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('missing_mongolian_vowel'));
});

test('rejects Mongolian outputs with repeated characters only', () => {
  const result = evaluateTranslationCandidate({
    candidate: 'аааааа',
    base: 'Inventory summary',
    lang: 'mn',
  });
  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('insufficient_character_variety'));
});

test('requires substantive Mongolian words for longer phrases', () => {
  const result = evaluateTranslationCandidate({
    candidate: 'Өн',
    base: 'Consolidated financial statement',
    lang: 'mn',
  });
  assert.equal(result.status, 'fail');
  assert.ok(result.reasons.includes('insufficient_word_length'));
});

test('accepts meaningful Mongolian Cyrillic translations', () => {
  const result = evaluateTranslationCandidate({
    candidate: 'Борлуулалтын орлогын тайлан',
    base: 'Sales revenue report',
    lang: 'mn',
  });
  assert.equal(result.status, 'pass');
});
