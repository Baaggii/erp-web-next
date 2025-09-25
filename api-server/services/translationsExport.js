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

function ensureMeta(meta, key, module = '', context = '', page = '') {
  if (!key) return;
  const normalizedKey = String(key);
  const nextModule = module ?? '';
  const nextContext = context ?? '';
  const nextPage = page ?? '';
  if (!meta[normalizedKey]) {
    meta[normalizedKey] = {
      module: nextModule,
      context: nextContext,
      page: nextPage,
    };
    return;
  }
  const entry = meta[normalizedKey];
  if (entry.module == null || entry.module === '') {
    entry.module = nextModule;
  }
  if (
    (entry.context == null || entry.context === '' || entry.context === 'header_mapping') &&
    nextContext &&
    nextContext !== 'header_mapping'
  ) {
    entry.context = nextContext;
  }
  if ((entry.page == null || entry.page === '') && nextPage) {
    entry.page = nextPage;
  }
  if (entry.module == null) entry.module = '';
  if (entry.context == null) entry.context = '';
  if (entry.page == null) entry.page = '';
}

function collectObjectMeta(meta, obj, prefix = '', context = '') {
  if (typeof obj === 'string') {
    if (prefix) ensureMeta(meta, prefix, '', context);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const nextKey = prefix ? `${prefix}.${index}` : String(index);
      collectObjectMeta(meta, item, nextKey, context);
    });
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const nextKey = prefix ? `${prefix}.${k}` : k;
      collectObjectMeta(meta, v, nextKey, context);
    }
  }
}

function pickDefault(val) {
  if (val && typeof val === 'object') {
    if (typeof val.en === 'string') return val.en;
    const first = Object.values(val).find((v) => typeof v === 'string');
    return first !== undefined ? first : val;
  }
  return val;
}

function isLangObject(v) {
  if (!v || Array.isArray(v) || typeof v !== 'object') return false;
  const values = Object.values(v);
  return values.length > 0 && values.every((item) => typeof item === 'string');
}

function flattenLangObjects(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) {
      const item = obj[i];
      if (isLangObject(item)) {
        obj[i] = pickDefault(item);
      } else if (item && typeof item === 'object') {
        flattenLangObjects(item);
      }
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (isLangObject(v)) {
      obj[k] = pickDefault(v);
    } else if (v && typeof v === 'object') {
      flattenLangObjects(v);
    }
  }
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
  const metadata = {};
  collectObjectMeta(metadata, base, '', 'header_mapping');
  const headerKeys = new Set(Object.keys(base));
  const modules = await fetchModules();

  for (const { moduleKey, label } of modules) {
    if (base[moduleKey] === undefined) base[moduleKey] = pickDefault(label);
    ensureMeta(metadata, moduleKey, moduleKey, 'module_label');
  }

  const tPairs = collectPhrasesFromPages(path.resolve('src/erp.mgt.mn'));
  for (const { key, text, module: sourceModule, context, page } of tPairs) {
    if (base[key] === undefined) base[key] = pickDefault(text);
    ensureMeta(metadata, key, sourceModule, context || 'page', page);
  }

  try {
    const formConfigs = JSON.parse(fs.readFileSync(transactionFormsPath, 'utf8'));
    for (const forms of Object.values(formConfigs)) {
      if (!forms || typeof forms !== 'object') continue;
      for (const [formName, config] of Object.entries(forms)) {
        const formSlug = slugify(formName);
        if (base[`form.${formSlug}`] === undefined)
          base[`form.${formSlug}`] = pickDefault(formName);
        ensureMeta(metadata, `form.${formSlug}`, 'forms', 'form');
        function walk(obj, pathSegs) {
          if (!obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const segs = [...pathSegs, slugify(k)];
            if (typeof v === 'string') {
              if (/^[a-z0-9_.]+$/.test(v)) continue;
              const key = `form.${segs.join('.')}`;
              if (base[key] === undefined) base[key] = pickDefault(v);
              ensureMeta(metadata, key, 'forms', 'form_field');
            } else if (Array.isArray(v)) {
              for (const item of v) {
                if (item && typeof item === 'object') {
                  walk(item, segs);
                } else if (typeof item === 'string' && !/^[a-z0-9_.]+$/.test(item)) {
                  const key = `form.${segs.join('.')}.${slugify(item)}`;
                  if (base[key] === undefined) base[key] = pickDefault(item);
                  ensureMeta(metadata, key, 'forms', 'form_field');
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
            ensureMeta(metadata, key, 'user_level_actions', 'user_level_action');
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `userLevelActions.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = pickDefault(v);
            ensureMeta(metadata, key, 'user_level_actions', 'user_level_action');
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
            ensureMeta(metadata, key, 'pos_transaction_config', 'pos_config');
          }
        }
      } else {
        for (const [k, v] of Object.entries(obj)) {
          const segs = [...pathSegs, slugify(k)];
          if (typeof v === 'string') {
            if (skipString.test(v)) continue;
            const key = `posTransactionConfig.${segs.join('.')}`;
            if (base[key] === undefined) base[key] = pickDefault(v);
            ensureMeta(metadata, key, 'pos_transaction_config', 'pos_config');
          } else {
            walkPos(v, segs);
          }
        }
      }
    }
    walkPos(posConfig, []);
  } catch {}

  for (const key of headerKeys) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      throw new Error(`Missing header mapping key: ${key}`);
    }
  }

  const sorted = sortObj(base);
  const sortedMeta = sortObj(
    Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, {
        module: v.module ?? '',
        context: v.context ?? '',
        page: v.page ?? '',
      }]),
    ),
  );
  const exportPath = tenantConfigPath('exportedtexts.json', 0);
  fs.mkdirSync(path.dirname(exportPath), { recursive: true });
  fs.writeFileSync(
    exportPath,
    JSON.stringify({ translations: sorted, meta: sortedMeta }, null, 2),
  );
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
