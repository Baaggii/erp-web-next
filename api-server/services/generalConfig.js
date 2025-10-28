import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath, getConfigPath } from '../utils/configPaths.js';

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
    aiApiEnabled: Boolean(process.env.OPENAI_API_KEY),
    aiInventoryApiEnabled: false,
    triggerToastEnabled: true,
    procToastEnabled: true,
    viewToastEnabled: true,
    reportRowToastEnabled: true,
    imageToastEnabled: false,
    workplaceFetchToastEnabled: true,
    debugLoggingEnabled: false,
    editLabelsEnabled: false,
    showTourButtons: true,
    tourBuilderEnabled: true,
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

function coerceBoolean(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }
  if (typeof value === 'bigint') {
    return value !== 0n;
  }
  return fallback;
}

async function readConfig(companyId = 0) {
  const { path: filePath, isDefault } = await getConfigPath(
    'generalConfig.json',
    companyId,
  );

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
    result.general.workplaceFetchToastEnabled = coerceBoolean(
      result.general.workplaceFetchToastEnabled,
      defaults.general.workplaceFetchToastEnabled,
    );
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
  cfg.general.workplaceFetchToastEnabled = coerceBoolean(
    cfg.general.workplaceFetchToastEnabled,
    defaults.general.workplaceFetchToastEnabled,
  );
  if (!Object.prototype.hasOwnProperty.call(cfg.general, 'showTourButtons')) {
    cfg.general.showTourButtons = defaults.general.showTourButtons;
  }
  if (!Object.prototype.hasOwnProperty.call(cfg.general, 'tourBuilderEnabled')) {
    cfg.general.tourBuilderEnabled = defaults.general.tourBuilderEnabled;
  }
  if (updates.images) {
    Object.assign(cfg.images, updates.images);
  }
  await writeConfig(cfg, companyId);
  return { ...cfg, isDefault: false };
}
