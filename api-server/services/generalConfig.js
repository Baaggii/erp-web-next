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
  imageStorage: {
    basePath: 'uploaded_images/',
    defaultFolder: 'transactions/',
    posFolder: 'transactions_pos/',
  },
};

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.forms || parsed.pos) {
      return { ...defaults, ...parsed };
    }
    // migrate older flat structure to new nested layout
    return {
      forms: { ...defaults.forms, ...parsed },
      pos: { ...defaults.pos },
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
  if (updates.imageStorage) Object.assign(cfg.imageStorage, updates.imageStorage);
  await writeConfig(cfg);
  return cfg;
}
