import fs from 'fs';
import path from 'path';
import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default;

export function sortObj(o) {
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => ((acc[k] = o[k]), acc), {});
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
  const uiTags = new Set(['button', 'label', 'option']);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let ast;
    try {
      ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport'],
      });
    } catch (err) {
      console.warn(`[translations] Failed to parse ${file}: ${err.message}`);
      continue;
    }
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
        if (!uiTags.has(tag)) return;
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
