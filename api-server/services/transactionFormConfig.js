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

export async function getFormConfig(table) {
  const cfg = await readConfig();
  return (
    cfg[table] || {
      visibleFields: [],
      requiredFields: [],
      defaultValues: {},
      userIdField: null,
      branchIdField: null,
      companyIdField: null,
    }
  );
}

export async function getAllFormConfigs() {
  return readConfig();
}

export async function setFormConfig(table, config) {
  const {
    visibleFields = [],
    requiredFields = [],
    defaultValues = {},
    userIdField = null,
    branchIdField = null,
    companyIdField = null,
  } = config || {};
  const cfg = await readConfig();
  cfg[table] = {
    visibleFields,
    requiredFields,
    defaultValues,
    userIdField,
    branchIdField,
    companyIdField,
  };
  await writeConfig(cfg);
  return cfg[table];
}
