import test from 'node:test';
import assert from 'node:assert/strict';

function cleanIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]+/g, '');
}

function splitSqlStatements(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const statements = [];
  let current = [];
  let inTrigger = false;
  for (const line of lines) {
    current.push(line);
    if (inTrigger) {
      if (/END;?\s*$/.test(line)) {
        statements.push(current.join('\n').trim());
        current = [];
        inTrigger = false;
      }
    } else if (/^CREATE\s+TRIGGER/i.test(line)) {
      inTrigger = true;
    } else if (/;\s*$/.test(line)) {
      statements.push(current.join('\n').trim());
      current = [];
    }
  }
  if (current.length) {
    const stmt = current.join('\n').trim();
    if (stmt) statements.push(stmt.endsWith(';') ? stmt : stmt + ';');
  }
  return statements;
}

const TRIGGER_SEP_RE = /^\s*---+\s*$/m;
function buildTriggerScripts(text, tbl) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const chunks = trimmed
    .split(TRIGGER_SEP_RE)
    .map((c) => c.trim())
    .filter(Boolean);
  const statements = [];
  for (const chunk of chunks) {
    if (/^(CREATE|DROP)\s+TRIGGER/i.test(chunk)) {
      statements.push(...splitSqlStatements(chunk));
    } else {
      statements.push(chunk);
    }
  }
  const counts = {};
  const results = [];
  for (let i = 0; i < statements.length; i++) {
    const piece = statements[i].trim();
    if (/^(CREATE|DROP)\s+TRIGGER/i.test(piece)) {
      results.push(piece.endsWith(';') ? piece : piece + ';');
      continue;
    }
    const colMatch = piece.match(/SET\s+NEW\.\`?([A-Za-z0-9_]+)\`?\s*=/i);
    const col = colMatch ? cleanIdentifier(colMatch[1]) : `col${i + 1}`;
    counts[col] = (counts[col] || 0) + 1;
    const suffix = counts[col] > 1 ? `_bi${counts[col]}` : '_bi';
    const trgName = `${tbl}_${col}${suffix}`;
    let inner = piece;
    if (/^BEGIN/i.test(inner)) {
      inner = inner.replace(/^BEGIN/i, '').replace(/END;?$/i, '').trim();
    }

    const lines = inner.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const declareLines = [];
    while (lines.length && /^DECLARE\b/i.test(lines[0])) {
      declareLines.push(lines.shift().replace(/;?$/, ';'));
    }
    inner = lines.join('\n').trim();

    const startsWithCheck = new RegExp(`^IF\\s+NEW\\.${col}\\b`, 'i').test(inner);
    const declBlock = declareLines.length ? `  ${declareLines.join('\n  ')}\n` : '';

    if (startsWithCheck) {
      const body = `BEGIN\n${declBlock}  ${inner.replace(/;?\\s*$/, ';')}\nEND;`;
      results.push(
        `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`
      );
    } else {
      inner = inner.replace(/;?\\s*$/, ';');
      const body = `BEGIN\n${declBlock}  IF NEW.${col} IS NULL OR NEW.${col} = '' THEN\n    ${inner}\n  END IF;\nEND;`;
      results.push(
        `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`
      );
    }
  }
  return results.join('\n');
}

test('buildTriggerScripts avoids duplicate IF clause', () => {
  const snippet = `BEGIN\n  IF NEW.pid IS NULL OR NEW.pid = '' THEN\n    SET NEW.pid = 'x';\n  END IF;\nEND`;
  const sql = buildTriggerScripts(snippet, 't');
  const occurrences = sql.match(/IF NEW\.pid/gi) || [];
  assert.equal(occurrences.length, 1);
});

test('buildTriggerScripts keeps full CREATE TRIGGER intact', () => {
  const snippet = `CREATE TRIGGER t_pid_bi BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  IF NEW.pid IS NULL OR NEW.pid = '' THEN\n    IF NEW.branch = 1 THEN\n      SET NEW.pid = 'A';\n    ELSE\n      SET NEW.pid = 'B';\n    END IF;\n  END IF;\nEND;`;
  const sql = buildTriggerScripts(snippet, 't');
  assert.ok(sql.trim().endsWith('END;'));
  assert.ok(/CREATE TRIGGER/.test(sql));
});

test('buildTriggerScripts splits snippets on separator line', () => {
  const snippet = `BEGIN\n  SET NEW.x = 1;\nEND\n---\nBEGIN\n  SET NEW.y = 2;\nEND`;
  const sql = buildTriggerScripts(snippet, 't');
  const occurrences = sql.match(/CREATE TRIGGER/gi) || [];
  assert.equal(occurrences.length, 2);
});

test('buildTriggerScripts splits snippets with spaces around separator', () => {
  const snippet = `BEGIN\n  SET NEW.x = 1;\nEND\n  ---  \nBEGIN\n  SET NEW.y = 2;\nEND`;
  const sql = buildTriggerScripts(snippet, 't');
  const occurrences = sql.match(/CREATE TRIGGER/gi) || [];
  assert.equal(occurrences.length, 2);
});

test('buildTriggerScripts generates unique names for same column', () => {
  const snippet = `BEGIN\n  SET NEW.pid = 1;\nEND\n---\nBEGIN\n  SET NEW.pid = 2;\nEND`;
  const sql = buildTriggerScripts(snippet, 't');
  assert.ok(sql.includes('t_pid_bi2'));
  const occurrences = sql.match(/CREATE TRIGGER/gi) || [];
  assert.equal(occurrences.length, 2);
});

test('buildTriggerScripts handles DECLARE lines', () => {
  const snippet = `DECLARE x INT;\nSET NEW.pid = x;`;
  const sql = buildTriggerScripts(snippet, 't');
  assert.ok(sql.includes('DECLARE x INT;'));
  assert.ok(/IF NEW\.pid IS NULL/.test(sql));
});

test('buildTriggerScripts retains IF after DECLARE', () => {
  const snippet = `DECLARE y INT;\nIF NEW.pid IS NULL THEN\n  SET NEW.pid = y;\nEND IF;`;
  const sql = buildTriggerScripts(snippet, 't');
  const occurrences = sql.match(/IF NEW\.pid/gi) || [];
  assert.equal(occurrences.length, 1);
  assert.ok(sql.includes('DECLARE y INT;'));
});
