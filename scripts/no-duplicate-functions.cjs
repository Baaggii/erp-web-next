#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'src', 'erp.mgt.mn');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
  }
}

function normalizeBody(body) {
  return body
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

walk(root);
const seen = new Map();
const dupes = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const regex = /function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
  let match;
  while ((match = regex.exec(src))) {
    const whole = match[0];
    const body = match[1];
    const lineCount = whole.split('\n').length;
    if (lineCount <= 10) continue;
    const key = normalizeBody(body);
    if (!key) continue;
    const location = `${path.relative(process.cwd(), file)}:${src.slice(0, match.index).split('\n').length}`;
    if (!seen.has(key)) seen.set(key, [location]);
    else seen.get(key).push(location);
  }
}

for (const [_, locations] of seen.entries()) {
  if (locations.length > 1) dupes.push(locations);
}

if (dupes.length) {
  console.error('no-duplicate-functions: duplicate functions longer than 10 lines found');
  dupes.forEach((group, idx) => {
    console.error(`Group ${idx + 1}:`);
    group.forEach((loc) => console.error(`  - ${loc}`));
  });
  process.exit(1);
}

console.log('no-duplicate-functions: pass');
