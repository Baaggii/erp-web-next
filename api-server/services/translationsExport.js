import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfigPathSync, tenantConfigPath } from '../utils/configPaths.js';
import { slugify } from '../utils/slugify.js';
import {
  collectPhrasesFromPages,
  fetchModules,
  sortObj,
} from '../utils/translationHelpers.js';

function pickDefault(val) {
  if (val && typeof val === 'object') {
    if (typeof val.en === 'string') return val.en;
    const first = Object.values(val).find((v) => typeof v === 'string');
    return first !== undefined ? first : val;
  }
  return val;
}

function flattenLangObjects(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) {
      const item = obj[i];
      if (item && typeof item === 'object') {
        obj[i] = flattenLangObjects(item);
      }
    }
    return obj;
  }

  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      obj[k] = flattenLangObjects(v);
    }
  }

  const values = Object.values(obj);
  if (values.length && values.every((item) => typeof item === 'string')) {
    return pickDefault(obj);
  }

  return obj;
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
  flattenLangObjects(base);
  const modules = await fetchModules();

  for (const { moduleKey, label } of modules) {
    if (base[moduleKey] === undefined) base[moduleKey] = pickDefault(label);
  }

  const pagePairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
  for (const { key, text } of pagePairs) {
    if (base[key] === undefined) base[key] = pickDefault(text);
  }
  console.log(`[translations] collected ${pagePairs.length} phrases from pages`);

  try {
    const formConfigs = JSON.parse(fs.readFileSync(transactionFormsPath, 'utf8'));
    for (const forms of Object.values(formConfigs)) {
      if (!forms || typeof forms !== 'object') continue;
      for (const [formName, config] of Object.entries(forms)) {
        const formSlug = slugify(formName);
        if (base[`form.${formSlug}`] === undefined)
          base[`form.${formSlug}`] = pickDefault(formName);
        function walk(obj, pathSegs) {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const segs = [...pathSegs, slugify(k)];
            if (typeof v === 'string') {
              if (/^[a-z0-9_.]+$/.test(v)) continue;
              const key = `form.${segs.join('.')}`;
              if (base[key] === undefined) base[key] = pickDefault(v);
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (item && typeof item === 'object') {
                  walk(item, segs);
                } else if (typeof item === 'string' && !/^[a-z0-9_.]+$/.test(item)) {
                  const key = `form.${segs.join('.')}.${slugify(item)}`;
                  if (base[key] === undefined) base[key] = pickDefault(item);
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
            if (base[key] === undefined) base[key] = pickDefault(item);
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `userLevelActions.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = pickDefault(v);
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
            if (base[key] === undefined) base[key] = pickDefault(item);
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `posTransactionConfig.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = pickDefault(v);
          } else {
            walkPos(v, segs);
          }
        }
      }
    }
    walkPos(posConfig, []);
  } catch {}

  const sorted = sortObj(base);
  const exportPath = tenantConfigPath('exportedtexts.json', 0);
  fs.mkdirSync(path.dirname(exportPath), { recursive: true });
  fs.writeFileSync(exportPath, JSON.stringify(sorted, null, 2));
  console.log(`Exported translations written to ${exportPath}`);
  return exportPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const companyId = Number(process.argv[2] || 0);
  const run = async () => {
    try {
      await exportTranslations(companyId);
    } catch (err) {
      console.error(err);
      process.exit(1);
    } finally {
      try {
        const db = await import('../../db/index.js');
        await db.pool.end();
      } catch {}
    }
  };
  run();
}
