import fs from 'fs';
import path from 'path';

let parserModule;
try {
  parserModule = await import('@babel/parser');
} catch (err) {
  parserModule = null;
  console.warn(
    `[translations] Babel parser not available; falling back to regex parsing: ${err.message}`,
  );
}

let traverse;
if (parserModule) {
  try {
    const traverseModule = await import('@babel/traverse');
    traverse = traverseModule.default;
  } catch (err) {
    traverse = null;
    console.warn(
      `[translations] Babel traverse not available; falling back to regex parsing: ${err.message}`,
    );
  }
} else {
  traverse = null;
}

const parser = parserModule;

export function sortObj(o) {
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => ((acc[k] = o[k]), acc), {});
}

const UI_TAGS = new Set(['button', 'label', 'option']);

function collectPhrasesWithBabel(content, file) {
  if (!parser || !traverse) {
    return null;
  }
  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport'],
    });
    const pairs = [];
    traverse(ast, {
      CallExpression(path) {
        const callee = path.get('callee');
        if (callee.isIdentifier({ name: 't' })) {
          const args = path.get('arguments');
          if (args.length >= 1 && args[0].isStringLiteral()) {
            const key = args[0].node.value;
            const text =
              args.length > 1 && args[1].isStringLiteral()
                ? args[1].node.value
                : key;
            pairs.push({ key, text });
          }
        }
      },
      JSXElement(path) {
        const namePath = path.get('openingElement.name');
        if (!namePath.isJSXIdentifier()) return;
        const tag = namePath.node.name;
        if (!UI_TAGS.has(tag)) return;
        for (const child of path.get('children')) {
          if (child.isJSXText()) {
            const val = child.node.value.trim();
            if (val) pairs.push({ key: val, text: val });
          } else if (child.isJSXExpressionContainer()) {
            const expr = child.get('expression');
            if (expr.isStringLiteral()) {
              const val = expr.node.value.trim();
              if (val) pairs.push({ key: val, text: val });
            }
          }
        }
      },
    });
    return pairs;
  } catch (err) {
    console.warn(`[translations] Failed to parse ${file}: ${err.message}`);
    return null;
  }
}

function collectPhrasesWithRegex(content) {
  const pairs = [];
  const callRegex = /t\(\s*(['"])(.*?)\1\s*(?:,\s*(['"])(.*?)\3)?/g;
  for (const match of content.matchAll(callRegex)) {
    const key = match[2];
    if (!key) continue;
    const alt = match[4];
    pairs.push({ key, text: alt ?? key });
  }
  const tagRegex = /<(button|label|option)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of content.matchAll(tagRegex)) {
    const inner = match[2];
    if (!inner) continue;
    const cleaned = inner
      .replace(/\{[^}]*\}/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) {
      pairs.push({ key: cleaned, text: cleaned });
    }
  }
  return pairs;
}

export function collectPhrasesFromPages(dir) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  }
  walk(dir);
  const pairs = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const babelPairs = collectPhrasesWithBabel(content, file);
    if (babelPairs) {
      pairs.push(...babelPairs);
    } else {
      pairs.push(...collectPhrasesWithRegex(content));
    }
  }
  return pairs;
}

export async function fetchModules() {
  try {
    const db = await import('../../db/index.js');
    try {
      const [rows] = await db.pool.query(
        'SELECT module_key AS moduleKey, label FROM modules',
      );
      return rows.map((r) => ({ moduleKey: r.moduleKey, label: r.label }));
    } catch (err) {
      console.warn(
        `[translations] DB query failed; falling back to defaults: ${err.message}`,
      );
    }
  } catch (err) {
    console.warn(
      `[translations] Failed to load DB modules; falling back: ${err.message}`,
    );
  }
  const fallback = await import('../../db/defaultModules.js');
  return fallback.default.map(({ moduleKey, label }) => ({ moduleKey, label }));
}
