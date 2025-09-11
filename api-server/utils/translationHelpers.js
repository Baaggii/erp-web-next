import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

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
  const regex = /\bt\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?\s*\)/g;
  const pairs = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = regex.exec(content))) {
      pairs.push({ key: match[1], text: match[2] || match[1] });
    }
    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });
      traverse(ast, {
        JSXElement({ node }) {
          const nameNode = node.openingElement.name;
          const tag =
            nameNode && nameNode.type === 'JSXIdentifier'
              ? nameNode.name
              : null;
          const textTags = new Set(['button', 'option', 'label', 'legend']);
          const attrTags = new Set(['input', 'textarea', 'select', 'button']);
          const attrs = new Set(['placeholder', 'aria-label', 'title']);
          if (tag && textTags.has(tag)) {
            for (const child of node.children) {
              if (child.type === 'JSXText') {
                const text = child.value.trim();
                if (text) pairs.push({ key: text, text });
              } else if (
                child.type === 'JSXExpressionContainer' &&
                child.expression.type === 'StringLiteral'
              ) {
                const text = child.expression.value.trim();
                if (text) pairs.push({ key: text, text });
              }
            }
          }
          if (tag && attrTags.has(tag)) {
            for (const attr of node.openingElement.attributes) {
              if (
                attr.type === 'JSXAttribute' &&
                attr.name &&
                attrs.has(attr.name.name) &&
                attr.value &&
                attr.value.type === 'StringLiteral'
              ) {
                const text = attr.value.value.trim();
                if (text) pairs.push({ key: text, text });
              }
            }
          }
        },
      });
    } catch (err) {
      console.warn(`Failed to parse ${file}: ${err.message}`);
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
