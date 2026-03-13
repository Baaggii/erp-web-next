import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src', 'erp.mgt.mn');
const CORE_PATH = `${path.sep}src${path.sep}erp.mgt.mn${path.sep}core${path.sep}`;
const EXTS = new Set(['.js', '.jsx', '.mjs']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function normalize(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\b[_$a-zA-Z][_$a-zA-Z0-9]*\b/g, 'ID')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, 'STR')
    .trim();
}

function collectFunctions(content) {
  const lines = content.split('\n');
  const entries = [];
  const starts = [
    /function\s+[_$a-zA-Z][_$a-zA-Z0-9]*\s*\([^)]*\)\s*\{/g,
    /(?:const|let|var)\s+[_$a-zA-Z][_$a-zA-Z0-9]*\s*=\s*\([^)]*\)\s*=>\s*\{/g,
    /(?:const|let|var)\s+[_$a-zA-Z][_$a-zA-Z0-9]*\s*=\s*function\s*\([^)]*\)\s*\{/g,
  ];

  lines.forEach((line, idx) => {
    for (const re of starts) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (!match) continue;
      let braceDepth = 0;
      let started = false;
      const block = [];
      for (let j = idx; j < lines.length; j += 1) {
        const current = lines[j];
        block.push(current);
        for (const ch of current) {
          if (ch === '{') {
            braceDepth += 1;
            started = true;
          }
          if (ch === '}') braceDepth -= 1;
        }
        if (started && braceDepth === 0) {
          const len = j - idx + 1;
          if (len > 10) {
            entries.push({ line: idx + 1, code: block.join('\n') });
          }
          return;
        }
      }
    }
  });

  return entries;
}

const groups = new Map();
for (const file of walk(SOURCE_DIR)) {
  const content = fs.readFileSync(file, 'utf8');
  const funcs = collectFunctions(content);
  funcs.forEach((fn) => {
    const key = normalize(fn.code);
    const list = groups.get(key) || [];
    list.push({ file, line: fn.line });
    groups.set(key, list);
  });
}

const duplicates = [...groups.values()].filter((items) => {
  if (items.length < 2) return false;
  const outsideCore = items.filter((item) => !item.file.includes(CORE_PATH));
  return outsideCore.length > 1;
});

if (duplicates.length) {
  console.error('Duplicate functions (>10 lines) detected outside src/erp.mgt.mn/core/:');
  duplicates.forEach((items, index) => {
    console.error(`\nGroup #${index + 1}`);
    items.forEach((item) => {
      console.error(` - ${path.relative(ROOT, item.file)}:${item.line}`);
    });
  });
  process.exit(1);
}

console.log('No duplicate functions (>10 lines) detected outside src/erp.mgt.mn/core/.');
