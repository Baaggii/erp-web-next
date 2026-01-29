import { currentLoaderKey, dispatchEnd, dispatchStart } from './loadingEvents.js';

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export default async function safeRequest(url, options = {}) {
  const {
    skipLoader,
    loaderKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    ...rest
  } = options || {};
  const key = skipLoader ? null : loaderKey || currentLoaderKey();
  if (key) dispatchStart(key);
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timeout = normalizeTimeout(timeoutMs);
  let timeoutId;
  if (timeout) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      skipLoader: true,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (key) dispatchEnd(key);
  }
}
