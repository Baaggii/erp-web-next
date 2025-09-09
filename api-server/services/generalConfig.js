import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath } from '../utils/configPaths.js';

const defaults = {
  forms: {
    labelFontSize: 14,
    boxWidth: 60,
    boxHeight: 30,
    boxMaxWidth: 150,
    boxMaxHeight: 150,
  },
  pos: {
    labelFontSize: 14,
    boxWidth: 60,
    boxHeight: 30,
    boxMaxWidth: 150,
    boxMaxHeight: 150,
  },
  general: {
    aiApiEnabled: false,
    aiInventoryApiEnabled: false,
    triggerToastEnabled: true,
    procToastEnabled: true,
    viewToastEnabled: true,
    reportRowToastEnabled: true,
    imageToastEnabled: false,
    debugLoggingEnabled: false,
    editLabelsEnabled: false,
    showReportParams: false,
    requestPollingEnabled: false,
    requestPollingIntervalSeconds: 30,
    procLabels: {},
    procFieldLabels: {},
    reportProcPrefix: '',
    reportViewPrefix: '',
  },
  images: {
    basePath: 'uploads',
    cleanupDays: 30,
    ignoreOnSearch: ['deleted_images'],
  },
};

async function readConfig(companyId = 0) {
  const tenantFile = tenantConfigPath('generalConfig.json', companyId);
  let filePath = tenantFile;
  let isDefault = false;
  try {
    await fs.access(tenantFile);
  } catch {
    filePath = tenantConfigPath('generalConfig.json', 0);
    isDefault = true;
  }

  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    let result;
    if (parsed.forms || parsed.pos || parsed.general || parsed.images) {
      const { imageStorage, ...restGeneral } = parsed.general || {};
      const images = parsed.images || imageStorage || {};
      result = {
        ...defaults,
        ...parsed,
        general: {
          ...defaults.general,
          ...restGeneral,
        },
        images: {
          ...defaults.images,
          ...images,
        },
      };
    } else {
      // migrate older flat structure to new nested layout
      result = {
        forms: { ...defaults.forms, ...parsed },
        pos: { ...defaults.pos },
        general: { ...defaults.general },
        images: { ...defaults.images },
      };
    }
    return { config: result, isDefault };
  } catch {
    return { config: { ...defaults }, isDefault: true };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const filePath = tenantConfigPath('generalConfig.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getGeneralConfig(companyId = 0) {
  return readConfig(companyId);
}

export async function updateGeneralConfig(updates = {}, companyId = 0) {
  const { config: cfg } = await readConfig(companyId);
  if (updates.forms) Object.assign(cfg.forms, updates.forms);
  if (updates.pos) Object.assign(cfg.pos, updates.pos);
  if (updates.general) {
    Object.assign(cfg.general, updates.general);
  }
  if (updates.images) {
    Object.assign(cfg.images, updates.images);
  }
  await writeConfig(cfg, companyId);
  return { ...cfg, isDefault: false };
}
