import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import translateWithCache from '../src/erp.mgt.mn/utils/translateWithCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const companyId = process.env.COMPANY_ID || '0';
const configDir = path.join(rootDir, 'config', String(companyId));
const docsDir = path.join(rootDir, 'docs');
const manualsDir = path.join(docsDir, 'manuals');

async function loadJSON(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function getModules(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/modules`);
    if (!res.ok) throw new Error('Failed to load modules');
    return await res.json();
  } catch (err) {
    console.warn('fetch modules failed:', err.message);
    return [];
  }
}

function moduleSlug(key) {
  return key.replace(/_/g, '-');
}

async function translateLabel(lang, key, fallback, metadata) {
  const result = await translateWithCache(lang, key, fallback, metadata);
  if (!result) return fallback ?? '';
  return result.text ?? (fallback ?? '');
}

async function loadLabels(lang = 'en') {
  const headerMap = await loadJSON(path.join(configDir, 'headerMappings.json'));
  const translate = async (key) => {
    const fallback = headerMap[key];
    return translateLabel(lang, key, fallback);
  };
  return translate;
}

async function collectConfigs() {
  const transactionForms = await loadJSON(
    path.join(configDir, 'transactionForms.json'),
  );
  const tableDisplayFields = await loadJSON(
    path.join(configDir, 'tableDisplayFields.json'),
  );
  return { transactionForms, tableDisplayFields };
}

function findDisplayConfig(tableDisplayFields, table) {
  if (!table) return null;
  if (Array.isArray(tableDisplayFields)) {
    const entries = tableDisplayFields.filter((cfg) => cfg?.table === table);
    return (
      entries.find((cfg) => !cfg.filterColumn && !cfg.filterValue) ||
      entries[0] ||
      null
    );
  }
  if (tableDisplayFields && typeof tableDisplayFields === 'object') {
    return tableDisplayFields[table] || null;
  }
  return null;
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function captureScreenshot(url, requiredFields) {
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.addScriptTag({
      url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    });
    await page.evaluate((fields) => {
      fields.forEach((f) => {
        const el =
          document.querySelector(`[name="${f}"]`) || document.getElementById(f);
        if (el) el.style.outline = '2px solid red';
      });
    }, requiredFields);
    const dataUrl = await page.evaluate(async () => {
      const canvas = await html2canvas(document.body);
      return canvas.toDataURL('image/png');
    });
    await browser.close();
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } catch (err) {
    console.warn('screenshot failed:', err.message);
    return null;
  }
}

async function generateManualForModule(module, translate, configs, options) {
  const { lang } = options;
  const slug = moduleSlug(module.module_key);
  let md = `# ${await translate(module.module_key)}\n\n`;

  const docSnippet = path.join(docsDir, `${module.module_key}.md`);
  if (await fileExists(docSnippet)) {
    md += await fs.readFile(docSnippet, 'utf8');
    md += '\n\n';
  }

  const formsCfg = configs.transactionForms[module.module_key] || {};
  for (const [formName, formCfg] of Object.entries(formsCfg)) {
    const fTitle = await translate(formName);
    md += `## ${fTitle}\n`;
    if (formCfg.visibleFields?.length) {
      const vis = await Promise.all(formCfg.visibleFields.map((f) => translate(f)));
      md += `- ${await translateLabel(lang, 'visible', 'Visible')}: ${vis.join(', ')}\n`;
    }
    if (formCfg.requiredFields?.length) {
      const req = await Promise.all(formCfg.requiredFields.map((f) => translate(f)));
      md += `- ${await translateLabel(lang, 'required', 'Required')}: ${req.join(', ')}\n`;
    }
    if (formCfg.defaultValues && Object.keys(formCfg.defaultValues).length) {
      const defsArr = await Promise.all(
        Object.entries(formCfg.defaultValues).map(async ([k, v]) => `${await translate(k)}=${v}`),
      );
      md += `- ${await translateLabel(lang, 'defaults', 'Defaults')}: ${defsArr.join(', ')}\n`;
    }
    if (formCfg.conditions && Object.keys(formCfg.conditions).length) {
      md += `- ${await translateLabel(lang, 'conditions', 'Conditions')}: ${JSON.stringify(formCfg.conditions)}\n`;
    }
    md += '\n';
  }

  const tableCfg = findDisplayConfig(configs.tableDisplayFields, module.module_key);
  if (tableCfg) {
    md += `### ${await translateLabel(lang, 'tableDisplay', 'Table Display')}\n`;
    md += `- ${await translateLabel(lang, 'idField', 'ID Field')}: ${await translate(tableCfg.idField)}\n`;
    const display = await Promise.all(tableCfg.displayFields.map((f) => translate(f)));
    md += `- ${await translateLabel(lang, 'displayFields', 'Display Fields')}: ${display.join(', ')}\n`;
    md += '\n';
  }

  const html = marked.parse(md);
  const manual = { md, html, slug };

  if (options.capture) {
    const reqFields = new Set();
    Object.values(formsCfg).forEach((f) =>
      (f.requiredFields || []).forEach((r) => reqFields.add(r)),
    );
    const url = `${options.baseUrl}/#/${slug}`;
    const buf = await captureScreenshot(url, Array.from(reqFields));
    if (buf) manual.screenshot = buf;
  }

  return manual;
}

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const args = process.argv.slice(2);
  const capture = args.includes('--capture');
  const lang = args.find((a) => !a.startsWith('--')) || 'en';

  const translate = await loadLabels(lang);
  const configs = await collectConfigs();
  await fs.mkdir(manualsDir, { recursive: true });

  const modules = await getModules(baseUrl);

  const manifest = {};
  for (const mod of modules) {
    const manual = await generateManualForModule(mod, translate, configs, {
      capture,
      baseUrl,
      lang,
    });
    const mdFile = path.join(manualsDir, `${mod.module_key}.md`);
    const htmlFile = path.join(manualsDir, `${mod.module_key}.html`);
    await fs.writeFile(mdFile, manual.md, 'utf8');
    await fs.writeFile(htmlFile, manual.html, 'utf8');
    const entry = { markdown: path.relative(manualsDir, mdFile), html: path.relative(manualsDir, htmlFile) };
    if (manual.screenshot) {
      const imgFile = path.join(manualsDir, `${mod.module_key}.png`);
      await fs.writeFile(imgFile, manual.screenshot);
      entry.screenshot = path.relative(manualsDir, imgFile);
    }
    manifest[mod.module_key] = entry;
  }

  await fs.writeFile(
    path.join(manualsDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
