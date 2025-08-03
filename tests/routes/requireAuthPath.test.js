import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Ensure RequireAuth wrapper has no path to avoid nested absolute route errors

test('RequireAuth route wrapper has no path', () => {
  const src = fs.readFileSync('src/erp.mgt.mn/App.jsx', 'utf8');
  const lines = src.split('\n');
  const routeLine = lines.find((l) => l.includes('element={<RequireAuth />'));
  assert(routeLine && !/path=/.test(routeLine), 'RequireAuth Route should be pathless');
});
