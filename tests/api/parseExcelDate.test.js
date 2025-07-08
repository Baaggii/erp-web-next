import test from 'node:test';
import assert from 'node:assert/strict';


// Inline copy of parseExcelDate from codingTableController.js
function parseExcelDate(val) {
  if (typeof val === 'number') {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + val);
    return base;
  }
  if (typeof val === 'string') {
    val = val.trim();
    if (val.includes(',')) val = val.replace(/,/g, '-');
    const m = val.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
    if (m) {
      const [, y, mo, d] = m;
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    }
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

test('parseExcelDate handles comma separated date', () => {
  const d = parseExcelDate('2023,08,16');
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), '2023-08-16');
});
