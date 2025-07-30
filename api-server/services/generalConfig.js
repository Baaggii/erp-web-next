import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'generalConfig.json');

const defaults = {
  general: {
    imageDir: 'txn_images',
  },
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
};

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.forms || parsed.pos || parsed.general) {
      return {
        general: { ...defaults.general, ...(parsed.general || {}) },
        forms: { ...defaults.forms, ...(parsed.forms || {}) },
        pos: { ...defaults.pos, ...(parsed.pos || {}) },
      };
    }
    // migrate older flat structure to new nested layout
    return {
      general: { ...defaults.general },
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
  if (updates.general) Object.assign(cfg.general, updates.general);
  if (updates.forms) Object.assign(cfg.forms, updates.forms);
  if (updates.pos) Object.assign(cfg.pos, updates.pos);
  await writeConfig(cfg);
  return cfg;
}
