import test from 'node:test';
import assert from 'node:assert/strict';

function cleanIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]+/g, '');
}

function buildTriggerScripts(text, tbl) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const pattern = /(CREATE\s+TRIGGER[\s\S]*?END;?|BEGIN[\s\S]*?END;?)/gi;
  const matches = trimmed.match(pattern) || [trimmed];
  const counts = {};
  const results = matches.map((m, idx) => {
    const piece = m.trim();
    if (/^CREATE\s+TRIGGER/i.test(piece)) {
      return piece.endsWith(';') ? piece : piece + ';';
    }
    const colMatch = piece.match(/SET\s+NEW\.\`?([A-Za-z0-9_]+)\`?\s*=/i);
    const col = colMatch ? cleanIdentifier(colMatch[1]) : `col${idx + 1}`;
    counts[col] = (counts[col] || 0) + 1;
    const suffix = counts[col] > 1 ? `_bi${counts[col]}` : '_bi';
    const trgName = `${tbl}_${col}${suffix}`;

    let inner = piece;
    if (/^BEGIN/i.test(inner)) {
      inner = inner.replace(/^BEGIN/i, '').replace(/END;?$/i, '').trim();
    }

    const startsWithCheck = new RegExp(`^IF\\s+NEW\\.${col}\\b`, 'i').test(inner);
    if (startsWithCheck) {
      const body = `BEGIN\n  ${inner.replace(/;?\s*$/, ';')}\nEND;`;
      return `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`;
    }

    inner = inner.replace(/;?\s*$/, ';');
    const body = `BEGIN\n  IF NEW.${col} IS NULL OR NEW.${col} = '' THEN\n    ${inner}\n  END IF;\nEND;`;

    return `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`;
  });
  return results.join('\n');
}

test('buildTriggerScripts avoids duplicate IF clause', () => {
  const snippet = `BEGIN\n  IF NEW.pid IS NULL OR NEW.pid = '' THEN\n    SET NEW.pid = 'x';\n  END IF;\nEND`;
  const sql = buildTriggerScripts(snippet, 't');
  const occurrences = sql.match(/IF NEW\.pid/gi) || [];
  assert.equal(occurrences.length, 1);
});
