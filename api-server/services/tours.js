import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { resolveDataPath, tenantDataPath } from '../utils/dataPaths.js';

const FILE_NAME = 'tours.json';

function normalizePath(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return null;
  const [withoutHash] = pathValue.split('#');
  const [clean] = (withoutHash || pathValue).split('?');
  if (!clean) return null;
  const trimmed = clean.trim();
  return trimmed || null;
}

function createStepId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceNumber(value) {
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function coerceSelectorValue(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeSelectors(selectors, fallback) {
  const list = Array.isArray(selectors)
    ? selectors
        .map((value) => coerceSelectorValue(value).trim())
        .filter(Boolean)
    : [];
  const seen = new Set();
  const normalized = [];
  list.forEach((value) => {
    if (seen.has(value)) return;
    seen.add(value);
    normalized.push(value);
  });
  if (!normalized.length) {
    const fallbackValue = typeof fallback === 'string' ? fallback.trim() : '';
    if (fallbackValue) normalized.push(fallbackValue);
  }
  return normalized;
}

function sanitizeStep(step, index) {
  if (!step || typeof step !== 'object') return null;
  const selectorSource =
    typeof step.selector === 'string' && step.selector.trim()
      ? step.selector.trim()
      : typeof step.target === 'string' && step.target.trim()
        ? step.target.trim()
        : '';
  const selectors = normalizeSelectors(step.selectors, selectorSource);
  const selector = selectors[0] || '';
  const idSource = typeof step.id === 'string' && step.id.trim() ? step.id.trim() : null;
  const titleSource = typeof step.title === 'string' ? step.title.trim() : null;
  const placementSource =
    typeof step.placement === 'string' && step.placement.trim()
      ? step.placement.trim()
      : typeof step.position === 'string' && step.position.trim()
        ? step.position.trim()
        : null;
  const contentValue =
    typeof step.content === 'string' || typeof step.content === 'number'
      ? String(step.content)
      : '';

  const orderValue = coerceNumber(step.order);
  const normalized = {
    id: idSource || createStepId(),
    selectors,
    selector,
    target: selector,
    content: contentValue,
    order: orderValue ?? index,
  };

  if (placementSource) normalized.placement = placementSource;
  if (titleSource) normalized.title = titleSource;

  const offset = coerceNumber(step.offset);
  if (offset !== undefined) normalized.offset = offset;

  const spotlightPadding = coerceNumber(step.spotlightPadding);
  if (spotlightPadding !== undefined) normalized.spotlightPadding = spotlightPadding;

  if (step.isFixed !== undefined) normalized.isFixed = Boolean(step.isFixed);
  if (step.disableBeacon !== undefined) normalized.disableBeacon = Boolean(step.disableBeacon);

  if (step.locale && typeof step.locale === 'string') normalized.locale = step.locale;
  if (step.tooltip && typeof step.tooltip === 'string') normalized.tooltip = step.tooltip;

  if (step.styles && typeof step.styles === 'object') normalized.styles = step.styles;
  if (step.floaterProps && typeof step.floaterProps === 'object') {
    normalized.floaterProps = step.floaterProps;
  }

  // Empty selector steps are ignored
  if (!normalized.selector) return null;

  return normalized;
}

function sortAndNormalizeSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const sanitized = list
    .map((step, idx) => sanitizeStep(step, idx))
    .filter(Boolean);
  sanitized.sort((a, b) => {
    const aOrder = coerceNumber(a.order) ?? 0;
    const bOrder = coerceNumber(b.order) ?? 0;
    return aOrder - bOrder;
  });
  return sanitized.map((step, index) => ({ ...step, order: index }));
}

async function readTours(companyId) {
  try {
    const filePath = await resolveDataPath(FILE_NAME, companyId);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeTours(companyId, tours) {
  const filePath = tenantDataPath(FILE_NAME, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(tours, null, 2));
  return tours;
}

function toResponse(pageKey, record) {
  if (!record) return null;
  const pathValue = normalizePath(record.path);
  const steps = sortAndNormalizeSteps(record.steps);
  return {
    pageKey,
    path: pathValue,
    steps,
  };
}

export async function listTours(companyId) {
  const tours = await readTours(companyId);
  return Object.keys(tours)
    .sort()
    .map((pageKey) => toResponse(pageKey, tours[pageKey]))
    .filter(Boolean);
}

export async function getTour({ pageKey, path }, companyId) {
  const tours = await readTours(companyId);
  const normalizedPath = normalizePath(path);

  if (normalizedPath) {
    for (const [key, value] of Object.entries(tours)) {
      if (normalizePath(value?.path) === normalizedPath) {
        return toResponse(key, value);
      }
    }
  }

  if (pageKey && tours[pageKey]) {
    return toResponse(pageKey, tours[pageKey]);
  }

  return null;
}

export async function saveTour(pageKey, payload, companyId) {
  if (!pageKey) {
    throw new Error('A pageKey is required to save a tour');
  }
  const tours = await readTours(companyId);
  const normalizedPath = normalizePath(payload?.path);
  const steps = sortAndNormalizeSteps(payload?.steps);
  tours[pageKey] = {
    path: normalizedPath,
    steps,
  };
  await writeTours(companyId, tours);
  return {
    pageKey,
    path: normalizedPath,
    steps,
  };
}

export async function deleteTour(pageKey, companyId) {
  if (!pageKey) return false;
  const tours = await readTours(companyId);
  if (!Object.prototype.hasOwnProperty.call(tours, pageKey)) {
    return false;
  }
  delete tours[pageKey];
  await writeTours(companyId, tours);
  return true;
}
