import test from 'node:test';
import assert from 'node:assert/strict';

import { createGeneratedColumnEvaluator } from '../../src/erp.mgt.mn/utils/generatedColumns.js';

test('parses backtick identifiers wrapped in parentheses', () => {
  const evaluator = createGeneratedColumnEvaluator(
    "if(`tax_reason_code`,0,(`or_or`/11))",
    {
      tax_reason_code: 'tax_reason_code',
      or_or: 'or_or',
    },
  );

  assert.equal(typeof evaluator, 'function');
  assert.equal(
    evaluator({ row: { tax_reason_code: 0, or_or: 22 } }),
    2,
    'expects parser to evaluate nested parentheses',
  );
  assert.equal(
    evaluator({ row: { tax_reason_code: 5, or_or: 22 } }),
    0,
    'truthy first argument should short-circuit IF()',
  );
});
