import fs from 'fs/promises';
import path from 'path';
import {
  tenantConfigPath,
  tenantConfigRoot,
  getConfigBasePath,
  getConfigPath,
} from '../utils/configPaths.js';

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
    ebarimtToastEnabled: false,
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
  reports: {
    showReportLineageInfo: false,
  },
  finReporting: {
    showJournalActionDebug: false,
  },
  plan: {
    planIdFieldName: '',
    notificationFields: 'is_plan,is_plan_completion',
    notificationValues: '1',
  },
  notifications: {
    workflowToastEnabled: false,
  },
  images: {
    basePath: 'uploads',
    cleanupDays: 30,
    ignoreOnSearch: ['deleted_images'],
  },
  print: {
    printFontSize: 13,
    printMargin: 4,
    printGap: 3,
    receiptFontSize: 12,
    receiptWidth: 80,
    receiptHeight: 200,
    receiptMargin: 5,
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

function withSystemInfo(config, companyId) {
  return {
    ...config,
    system: {
      configBasePath: getConfigBasePath(),
      tenantFolder: tenantConfigRoot(companyId),
    },
  };
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
    if (
      parsed.forms ||
      parsed.pos ||
      parsed.general ||
      parsed.images ||
      parsed.print ||
      parsed.reports ||
      parsed.notifications ||
      parsed.finReporting
    ) {
      const { imageStorage, ...restGeneral } = parsed.general || {};
      const images = parsed.images || imageStorage || {};
      result = {
        ...defaults,
        ...parsed,
        general: {
          ...defaults.general,
          ...restGeneral,
        },
        reports: {
          ...defaults.reports,
          ...(parsed.reports || {}),
        },
        finReporting: {
          ...defaults.finReporting,
          ...(parsed.finReporting || {}),
        },
        notifications: {
          ...defaults.notifications,
          ...(parsed.notifications || {}),
        },
        plan: {
          ...defaults.plan,
          ...(parsed.plan || {}),
        },
        images: {
          ...defaults.images,
          ...images,
        },
        print: {
          ...defaults.print,
          ...(parsed.print || {}),
        },
      };
    } else {
      // migrate older flat structure to new nested layout
      result = {
        forms: { ...defaults.forms, ...parsed },
        pos: { ...defaults.pos },
        general: { ...defaults.general },
        reports: { ...defaults.reports },
        finReporting: { ...defaults.finReporting },
        notifications: { ...defaults.notifications },
        plan: { ...defaults.plan },
        images: { ...defaults.images },
        print: { ...defaults.print },
      };
    }
    result.general.workplaceFetchToastEnabled = coerceBoolean(
      result.general.workplaceFetchToastEnabled,
      defaults.general.workplaceFetchToastEnabled,
    );
    result.notifications.workflowToastEnabled = coerceBoolean(
      result.notifications.workflowToastEnabled,
      defaults.notifications.workflowToastEnabled,
    );
    return { config: withSystemInfo(result, companyId), isDefault };
  } catch {
    return { config: withSystemInfo({ ...defaults }, companyId), isDefault: true };
  }
}

async function writeConfig(cfg, companyId = 0) {
  const { system, ...persistable } = cfg;
  const filePath = tenantConfigPath('generalConfig.json', companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(persistable, null, 2));
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
  cfg.general.ebarimtToastEnabled = coerceBoolean(
    cfg.general.ebarimtToastEnabled,
    defaults.general.ebarimtToastEnabled,
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
  if (updates.reports) {
    Object.assign(cfg.reports, updates.reports);
  }
  if (updates.notifications) {
    Object.assign(cfg.notifications, updates.notifications);
  }
  if (updates.finReporting) {
    Object.assign(cfg.finReporting, updates.finReporting);
  }
  cfg.notifications.workflowToastEnabled = coerceBoolean(
    cfg.notifications.workflowToastEnabled,
    defaults.notifications.workflowToastEnabled,
  );
  if (updates.plan) {
    cfg.plan = {
      ...defaults.plan,
      ...cfg.plan,
      ...updates.plan,
    };
  }
  if (updates.print) {
    Object.assign(cfg.print, updates.print);
  }
  await writeConfig(cfg, companyId);
  return { ...cfg, isDefault: false };
}
