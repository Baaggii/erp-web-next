import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'generalConfig.json');

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
    procLabels: {},
    procFieldLabels: {},
  },
  images: {
    basePath: 'uploads',
    cleanupDays: 30,
    ignoreOnSearch: ['deleted_images'],
  },
};

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.forms || parsed.pos || parsed.general || parsed.images) {
      const { imageStorage, ...restGeneral } = parsed.general || {};
      const images = parsed.images || imageStorage || {};
      return {
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
    }
    // migrate older flat structure to new nested layout
    return {
      forms: { ...defaults.forms, ...parsed },
      pos: { ...defaults.pos },
      general: { ...defaults.general },
      images: { ...defaults.images },
    };
  } catch {
    return { ...defaults };
  }
}

async function writeConfig(cfg) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getGeneralConfig() {
  return readConfig();
}

export async function updateGeneralConfig(updates = {}) {
  const cfg = await readConfig();
  if (updates.forms) Object.assign(cfg.forms, updates.forms);
  if (updates.pos) Object.assign(cfg.pos, updates.pos);
  if (updates.general) {
    Object.assign(cfg.general, updates.general);
  }
  if (updates.images) {
    Object.assign(cfg.images, updates.images);
  }
  await writeConfig(cfg);
  return cfg;
}
