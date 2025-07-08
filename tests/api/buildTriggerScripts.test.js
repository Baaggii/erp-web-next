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
  let depth = 0;
  const beginRe = /\bBEGIN\b/i;
  const endRe = /\bEND\b\s*;?\s*$/i;
  const endBlockRe = /\bEND\s+(IF|WHILE|LOOP|REPEAT|CASE)\b/i;
  for (const line of lines) {
    current.push(line);
    if (inTrigger) {
      if (beginRe.test(line)) depth++;
      if (endRe.test(line) && !endBlockRe.test(line)) {
        if (depth === 0) {
          statements.push(current.join('\n').trim());
          current = [];
          inTrigger = false;
          continue;
        }
        depth--;
        if (depth === 0) {
          statements.push(current.join('\n').trim());
          current = [];
          inTrigger = false;
        }
      }
    } else if (/^CREATE\s+TRIGGER/i.test(line)) {
      inTrigger = true;
      if (beginRe.test(line)) depth = 1;
      else depth = 0;
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
function buildTriggerScripts(text, tbl, withDelimiter = false) {
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
      const isCreate = /^CREATE\s+TRIGGER/i.test(piece);
      if (withDelimiter && isCreate) {
        let stmt = piece.endsWith(';') ? piece.slice(0, -1) : piece;
        stmt = stmt.replace(/END;?$/i, 'END$$');
        results.push('DELIMITER $$');
        results.push(stmt);
        results.push('DELIMITER ;');
      } else {
        results.push(piece.endsWith(';') ? piece : piece + ';');
      }
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

    const startsWithCheck = new RegExp(`^IF\\s+NEW\\.${col}\\b`, 'i').test(inner);
    let body;
    if (startsWithCheck) {
      body = `BEGIN\n  ${inner.replace(/;?\\s*$/, ';')}\nEND;`;
    } else {
      inner = inner.replace(/;?\\s*$/, ';');
      body = `BEGIN\n  IF NEW.${col} IS NULL OR NEW.${col} = '' THEN\n    ${inner}\n  END IF;\nEND;`;
    }
    let stmt = `DROP TRIGGER IF EXISTS \`${trgName}\`;\nCREATE TRIGGER \`${trgName}\` BEFORE INSERT ON \`${tbl}\` FOR EACH ROW\n${body}`;
    if (withDelimiter) {
      stmt = `DELIMITER $$\n${stmt.replace(/END;$/, 'END$$')}\nDELIMITER ;`;
    }
    results.push(stmt);
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

test('buildTriggerScripts outputs delimiters when requested', () => {
  const snippet = `BEGIN\n  SET NEW.x = 1;\nEND`;
  const sql = buildTriggerScripts(snippet, 't', true);
  assert.ok(/DELIMITER \$\$/i.test(sql));
});
