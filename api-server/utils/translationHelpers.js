import fs from 'fs';
import path from 'path';

let parser = null;
let traverse = null;
try {
  const parserMod = await import('@babel/parser');
  parser = parserMod.default || parserMod;
  try {
    const traverseModule = await import('@babel/traverse');
    const candidates = [
      traverseModule?.default,
      traverseModule?.default?.default,
      traverseModule?.traverse,
      traverseModule,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'function') {
        traverse = candidate;
        break;
      }
    }
    if (!traverse) {
      console.warn(
        '[translations] Failed to load @babel/traverse; falling back to regex parsing: No traverse function export found.',
      );
      traverse = null;
      parser = null;
    }
  } catch (err) {
    console.warn(
      `[translations] Failed to load @babel/traverse; falling back to regex parsing: ${err.message}`,
    );
    parser = null;
  }
} catch (err) {
  console.warn(
    `[translations] Failed to load @babel/parser; falling back to regex parsing: ${err.message}`,
  );
  parser = null;
}

export function sortObj(o) {
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => ((acc[k] = o[k]), acc), {});
}

const HANGUL_REGEX = /\p{Script=Hangul}/u;
const HIRAGANA_KATAKANA_REGEX = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_IDEOGRAPH_REGEX = /\p{Script=Han}/u;
const CYRILLIC_REGEX = /\p{Script=Cyrillic}/u;
const LATIN_REGEX = /\p{Script=Latin}/u;

const MONGOLIAN_EXTRA_CYRILLIC = new Set([0x0401, 0x0451, 0x04ae, 0x04af, 0x04e8, 0x04e9]);

function isAllowedMongolianCyrillicCodePoint(codePoint) {
  return (
    (codePoint >= 0x0410 && codePoint <= 0x044f) ||
    MONGOLIAN_EXTRA_CYRILLIC.has(codePoint)
  );
}

function isLikelyMongolianCyrillic(value) {
  if (typeof value !== 'string') return false;
  let hasCyrillic = false;
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== 'number') continue;
    if (codePoint >= 0x0400 && codePoint <= 0x04ff) {
      hasCyrillic = true;
      if (!isAllowedMongolianCyrillicCodePoint(codePoint)) {
        return false;
      }
    }
  }
  return hasCyrillic;
}

export function isValidMongolianCyrillic(value) {
  if (typeof value !== 'string') return true;
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (
      typeof codePoint === 'number' &&
      codePoint >= 0x0400 &&
      codePoint <= 0x04ff &&
      !isAllowedMongolianCyrillicCodePoint(codePoint)
    ) {
      return false;
    }
  }
  return true;
}

export function detectLang(str) {
  if (typeof str !== 'string') return undefined;
  if (HANGUL_REGEX.test(str)) return 'ko';
  if (HIRAGANA_KATAKANA_REGEX.test(str)) return 'ja';
  if (CJK_IDEOGRAPH_REGEX.test(str)) return 'cjk';
  if (CYRILLIC_REGEX.test(str)) {
    return isLikelyMongolianCyrillic(str) ? 'mn' : 'ru';
  }
  if (LATIN_REGEX.test(str)) return 'latin';
  return undefined;
}

function defaultModuleResolver(rootDir, filePath) {
  if (!filePath) return '';
  const rel = path.relative(rootDir, filePath);
  if (!rel) return '';
  const normalized = rel.split(path.sep).join('/');
  return normalized.replace(/\.[^.]+$/, '');
}

export function collectPhrasesFromPages(dir, options = {}) {
  const { moduleResolver } = options;
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
  const seen = new Set();
  const addPairFactory = (moduleId) => (key, text, context = '') => {
    if (key == null || text == null) return;
    const normalized = `${key}:::${text}:::${moduleId ?? ''}:::${context ?? ''}`;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    pairs.push({
      key,
      text,
      module: moduleId ?? '',
      context: context ?? '',
    });
  };
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const moduleId =
      typeof moduleResolver === 'function'
        ? moduleResolver({ file, dir })
        : defaultModuleResolver(dir, file);
    const addPair = addPairFactory(moduleId);
    if (parser && traverse) {
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
              addPair(key, text, 'translation_call');
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
              if (val) addPair(val, val, tag);
            } else if (child.isJSXExpressionContainer()) {
              const expr = child.get('expression');
              if (expr.isStringLiteral()) {
                const val = expr.node.value.trim();
                if (val) addPair(val, val, tag);
              }
            }
          }
        },
      });
      continue;
    }

    const tagRegex = /<(button|label|option)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(content))) {
      const raw = match[2].replace(/<[^>]*>/g, '').trim();
      if (raw) addPair(raw, raw, match[1]);
    }
    const callRegex = /t\(\s*['"]([^'"\\]+)['"](?:\s*,\s*['"]([^'"\\]+)['"])?/gi;
    while ((match = callRegex.exec(content))) {
      const key = match[1];
      const text = match[2] ?? match[1];
      addPair(key, text, 'translation_call');
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
