import test from 'node:test';
import assert from 'node:assert/strict';

import { createGeneratedColumnEvaluator } from '../../src/erp.mgt.mn/utils/generatedColumns.js';

test('createGeneratedColumnEvaluator parses function calls with parentheses tokens', () => {
  const evaluator = createGeneratedColumnEvaluator(
    'if(`tax_reason_code`,0,(`or_or` / 11))',
    {},
  );

  assert.equal(typeof evaluator, 'function', 'evaluator should be created');

  const hasTaxReason = evaluator({
    row: { tax_reason_code: 1, or_or: 110 },
  });
  assert.equal(hasTaxReason, 0, 'tax reason should zero-out the value');

  const noTaxReason = evaluator({
    row: { tax_reason_code: 0, or_or: 110 },
  });
  assert.equal(noTaxReason, 10, 'should divide value when tax reason is falsy');
});
