import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import parser from '@babel/parser';
import traverse from '@babel/traverse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pagesDir = path.join(rootDir, 'src', 'erp.mgt.mn', 'pages');
const toursDir = path.join(rootDir, 'src', 'erp.mgt.mn', 'tours');
const configFile = path.join(rootDir, 'config', 'tourOrder.json');

async function readJSON(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function sanitizeKey(sel) {
  return sel.replace(/^[#.]/, '').replace(/[^\w]/g, '_');
}

function parseSelectors(code) {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
  });
  const selectors = [];
  traverse(ast, {
    JSXAttribute({ node }) {
      const { name, value } = node;
      if (!value || value.type !== 'StringLiteral') return;
      if (name.name === 'id') {
        selectors.push(`#${value.value}`);
      } else if (name.name === 'data-tour' || name.name === 'data-tour-id') {
        selectors.push(`[${name.name}="${value.value}"]`);
      }
    },
  });
  return selectors;
}

async function generate() {
  const overrides = await readJSON(configFile);
  const files = await fs.readdir(pagesDir);
  await fs.mkdir(toursDir, { recursive: true });
  for (const file of files) {
    if (!file.endsWith('.jsx') && !file.endsWith('.js')) continue;
    const pageName = path.basename(file, path.extname(file));
    const code = await fs.readFile(path.join(pagesDir, file), 'utf8');
    const defaultSelectors = parseSelectors(code);
    const selectors = overrides[pageName] || defaultSelectors;
    if (!selectors.length) continue;
    const steps = selectors
      .map((sel) => {
        const key = sanitizeKey(sel);
        return `  { selector: '${sel}', content: t('guide.${key}', '${key}') },`;
      })
      .join('\n');
    const content = `export default (t) => [\n${steps}\n];\n`;
    await fs.writeFile(path.join(toursDir, `${pageName}.js`), content);
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

