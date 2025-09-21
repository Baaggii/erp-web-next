import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTourSteps,
  findMissingTourTargets,
} from '../../src/erp.mgt.mn/utils/tourUtils.js';

test('normalizeTourSteps maps selector to target', () => {
  const result = normalizeTourSteps([
    { selector: '#foo', content: 'Foo' },
    { target: '#bar', content: 'Bar' },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].target, '#foo');
  assert.equal(result[1].target, '#bar');
});

test('normalizeTourSteps filters invalid entries', () => {
  const result = normalizeTourSteps([
    null,
    undefined,
    {},
    { content: 'no selector' },
    { selector: '', content: 'empty selector' },
    { target: '#valid', content: 'Valid' },
  ]);

  assert.deepEqual(result, [{ target: '#valid', content: 'Valid' }]);
});

test('findMissingTourTargets uses provided querySelector', () => {
  const steps = [
    { target: '#exists' },
    { target: '#missing' },
    { target: 'body' },
    { target: 'window' },
  ];
  const querySelector = (selector) => (selector === '#exists' ? {} : null);
  const missing = findMissingTourTargets(steps, querySelector);

  assert.deepEqual(missing, ['#missing']);
});

test('findMissingTourTargets returns empty array without selector function', () => {
  const missing = findMissingTourTargets([{ target: '#foo' }]);
  assert.deepEqual(missing, []);
});
