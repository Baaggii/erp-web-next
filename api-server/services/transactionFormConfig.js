import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'transactionForms.json');

async function readConfig() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.writeFile(filePath, JSON.stringify(cfg, null, 2));
}

export async function getFormConfig(table, name) {
  const cfg = await readConfig();
  const byTable = cfg[table] || {};
  return (
    byTable[name] || {
      visibleFields: [],
      requiredFields: [],
      defaultValues: {},
      userIdField: null,
      branchIdField: null,
      companyIdField: null,
    }
  );
}

export async function getConfigsByTable(table) {
  const cfg = await readConfig();
  return cfg[table] || {};
}

export async function listTransactionNames() {
  const cfg = await readConfig();
  const result = {};
  for (const [tbl, names] of Object.entries(cfg)) {
    for (const name of Object.keys(names)) {
      result[name] = tbl;
    }
  }
  return result;
}

export async function setFormConfig(table, name, config) {
  const {
    visibleFields = [],
    requiredFields = [],
    defaultValues = {},
    userIdField = null,
    branchIdField = null,
    companyIdField = null,
  } = config || {};
  const cfg = await readConfig();
  if (!cfg[table]) cfg[table] = {};
  cfg[table][name] = {
    visibleFields,
    requiredFields,
    defaultValues,
    userIdField,
    branchIdField,
    companyIdField,
  };
  await writeConfig(cfg);
  return cfg[table][name];
}

export async function deleteFormConfig(table, name) {
  const cfg = await readConfig();
  if (cfg[table]) {
    delete cfg[table][name];
    if (Object.keys(cfg[table]).length === 0) delete cfg[table];
    await writeConfig(cfg);
  }
}
