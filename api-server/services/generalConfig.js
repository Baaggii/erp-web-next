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
    debugLoggingEnabled: false,
    imageStorage: {
      basePath: 'uploads',
      cleanupDays: 30,
    },
  },
};

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.forms || parsed.pos || parsed.general) {
      return {
        ...defaults,
        ...parsed,
        general: {
          ...defaults.general,
          ...(parsed.general || {}),
          imageStorage: {
            ...defaults.general.imageStorage,
            ...(parsed.general?.imageStorage || {}),
          },
        },
      };
    }
    // migrate older flat structure to new nested layout
    return {
      forms: { ...defaults.forms, ...parsed },
      pos: { ...defaults.pos },
      general: {
        ...defaults.general,
        imageStorage: { ...defaults.general.imageStorage },
      },
    };
  } catch {
    return { ...defaults };
  }
}

async function writeConfig(cfg) {
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
    if (updates.general.imageStorage) {
      cfg.general.imageStorage = {
        ...cfg.general.imageStorage,
        ...updates.general.imageStorage,
      };
    }
    const { imageStorage, ...rest } = updates.general;
    Object.assign(cfg.general, rest);
  }
  await writeConfig(cfg);
  return cfg;
}
