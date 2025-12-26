import fs from 'fs';
import path from 'path';

function readJson(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

function isMappingProvided(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length > 0;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (value.value || value.envVar || value.sessionVar || value.expression) return true;
  if (value.column || value.table || typeof value.type === 'string') return true;
  return false;
}

function pickEndpoint(endpoints, id) {
  if (!Array.isArray(endpoints)) return null;
  return endpoints.find((ep) => ep?.id === id) || endpoints[0] || null;
}

function collectRequiredFields(hints = {}) {
  const gather = (list = []) =>
    (Array.isArray(list) ? list : [])
      .filter((entry) => entry && entry.required)
      .map((entry) => entry.field || entry.path)
      .filter(Boolean);

  return {
    topLevel: gather(hints.topLevelFields),
    items: gather(hints.itemFields),
    receipts: gather(hints.receiptFields),
    payments: gather(hints.paymentFields),
  };
}

function findMissing(mapping, requiredList = [], scope = '') {
  return requiredList.filter((field) => !isMappingProvided(mapping?.[field])).map((field) => `${scope}${field}`);
}

function main() {
  const endpointFile = process.argv[2] || 'config/posApiEndpoints.json';
  const formsFile = process.argv[3] || 'config/transactionForms.json';

  const endpoints = readJson(endpointFile);
  const formsByTable = readJson(formsFile);

  const issues = [];

  Object.entries(formsByTable).forEach(([table, forms]) => {
    Object.entries(forms || {}).forEach(([name, config]) => {
      if (!config?.posApiEnabled) return;
      const endpoint = pickEndpoint(endpoints, config.posApiEndpointId);
      const hints = endpoint?.mappingHints || {};
      const required = collectRequiredFields(hints);
      const mapping = config.posApiMapping || {};

      const missing = [
        ...findMissing(mapping, required.topLevel, ''),
        ...findMissing(mapping.itemFields || {}, required.items, 'items.'),
        ...findMissing(mapping.receiptFields || {}, required.receipts, 'receipts.'),
        ...findMissing(mapping.paymentFields || {}, required.payments, 'payments.'),
      ];

      if (missing.length) {
        issues.push({ table, name, endpointId: endpoint?.id || 'unknown', missing });
      }
    });
  });

  if (!issues.length) {
    console.log('✅ No missing POSAPI mappings detected.');
    return;
  }

  console.log('⚠️ Missing POSAPI mappings:');
  issues.forEach((issue) => {
    console.log(
      `- ${issue.table} / ${issue.name} (endpoint: ${issue.endpointId}) is missing: ${issue.missing.join(
        ', ',
      )}`,
    );
  });
  process.exitCode = 1;
}

main();
