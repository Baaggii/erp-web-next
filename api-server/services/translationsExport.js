import fs from 'fs';
import path from 'path';
import { getConfigPathSync } from '../utils/configPaths.js';
import { slugify } from '../utils/slugify.js';

function sortObj(o) {
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => ((acc[k] = o[k]), acc), {});
}

function collectPhrasesFromPages(dir) {
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
  }
  return pairs;
}

async function fetchModules() {
  try {
    const db = await import('../../db/index.js');
    try {
      const [rows] = await db.pool.query(
        'SELECT module_key AS moduleKey, label FROM modules',
      );
      await db.pool.end();
      return rows.map((r) => ({ moduleKey: r.moduleKey, label: r.label }));
    } catch (err) {
      try {
        await db.pool.end();
      } catch {}
    }
  } catch {}
  const fallback = await import('../../db/defaultModules.js');
  return fallback.default.map(({ moduleKey, label }) => ({ moduleKey, label }));
}

export async function exportTranslations(companyId = 0) {
  const { path: headerMappingsPath } = getConfigPathSync(
    'headerMappings.json',
    companyId,
  );
  const { path: transactionFormsPath } = getConfigPathSync(
    'transactionForms.json',
    companyId,
  );
  const base = JSON.parse(fs.readFileSync(headerMappingsPath, 'utf8'));
  const modules = await fetchModules();

  for (const { moduleKey, label } of modules) {
    if (base[moduleKey] === undefined) base[moduleKey] = label;
  }

  const tPairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
  for (const { key, text } of tPairs) {
    if (base[key] === undefined) base[key] = text;
  }

  try {
    const formConfigs = JSON.parse(fs.readFileSync(transactionFormsPath, 'utf8'));
    for (const forms of Object.values(formConfigs)) {
      if (!forms || typeof forms !== 'object') continue;
      for (const [formName, config] of Object.entries(forms)) {
        const formSlug = slugify(formName);
        if (base[`form.${formSlug}`] === undefined) base[`form.${formSlug}`] = formName;
        function walk(obj, pathSegs) {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const segs = [...pathSegs, slugify(k)];
            if (typeof v === 'string') {
              if (/^[a-z0-9_.]+$/.test(v)) continue;
              const key = `form.${segs.join('.')}`;
              if (base[key] === undefined) base[key] = v;
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (item && typeof item === 'object') {
                  walk(item, segs);
                } else if (typeof item === 'string' && !/^[a-z0-9_.]+$/.test(item)) {
                  const key = `form.${segs.join('.')}.${slugify(item)}`;
                  if (base[key] === undefined) base[key] = item;
                }
              }
            } else {
              walk(v, segs);
            }
          }
        }
        walk(config, [formSlug]);
      }
    }
  } catch {}

  const skipString = /^[a-z0-9_.\/:-]+$/;

  try {
    const ulaConfig = JSON.parse(
      fs.readFileSync(
        getConfigPathSync('userLevelActions.json', companyId).path,
        'utf8',
      ),
    );
    function walkUla(obj, pathSegs) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === 'object') {
            walkUla(item, pathSegs);
          } else if (typeof item === 'string' && !skipString.test(item)) {
            const baseKey = pathSegs.length
              ? `userLevelActions.${pathSegs.join('.')}`
              : 'userLevelActions';
            const key = `${baseKey}.${slugify(item)}`;
            if (base[key] === undefined) base[key] = item;
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `userLevelActions.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = v;
          } else {
            walkUla(v, segs);
          }
        }
      }
    }
    walkUla(ulaConfig, []);
  } catch {}

  try {
    const posConfig = JSON.parse(
      fs.readFileSync(
        getConfigPathSync('posTransactionConfig.json', companyId).path,
        'utf8',
      ),
    );
    function walkPos(obj, pathSegs) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === 'object') {
            const itemSeg = slugify(
              item.name || item.key || item.id || item.table || item.form || '',
            );
            walkPos(item, itemSeg ? [...pathSegs, itemSeg] : pathSegs);
          } else if (typeof item === 'string' && !skipString.test(item)) {
            const baseKey = pathSegs.length
              ? `posTransactionConfig.${pathSegs.join('.')}`
              : 'posTransactionConfig';
            const key = `${baseKey}.${slugify(item)}`;
            if (base[key] === undefined) base[key] = item;
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `posTransactionConfig.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = v;
          } else {
            walkPos(v, segs);
          }
        }
      }
    }
    walkPos(posConfig, []);
  } catch {}

  const sorted = sortObj(base);
  const exportPath = path.join(
    path.dirname(headerMappingsPath),
    'exportedtexts.json',
  );
  fs.writeFileSync(exportPath, JSON.stringify(sorted, null, 2));
  console.log(`Exported translations written to ${exportPath}`);
  return exportPath;
}
