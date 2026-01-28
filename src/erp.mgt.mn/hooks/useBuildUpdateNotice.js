import { useEffect, useRef, useState } from 'react';

const MODULE_SELECTOR = 'script[type="module"][src]';
const MODULE_SRC_REGEX = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i;

function normalizeModuleUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const base = typeof window !== 'undefined' ? window.location.href : undefined;
    const parsed = base ? new URL(url, base) : new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch (err) {
    const [stripped] = url.split(/[?#]/);
    return stripped || null;
  }
}

function getCurrentModuleUrl() {
  if (typeof document === 'undefined') return null;
  try {
    if (typeof document.querySelector === 'function') {
      const script = document.querySelector(MODULE_SELECTOR);
      if (script && typeof script.getAttribute === 'function') {
        return normalizeModuleUrl(script.getAttribute('src'));
      }
    }
  } catch (err) {
    if (typeof window !== 'undefined' && window.erpDebug) {
      console.warn('useBuildUpdateNotice: failed to read current module URL', err);
    }
  }
  return null;
}

function extractModuleUrlFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const match = MODULE_SRC_REGEX.exec(html);
  return match ? match[1] : null;
}

export default function useBuildUpdateNotice({ intervalMs = 30000 } = {}) {
  const [currentBundleUrl, setCurrentBundleUrl] = useState(() => getCurrentModuleUrl());
  const [latestBundleUrl, setLatestBundleUrl] = useState(currentBundleUrl);
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false);
  const bundleUrlRef = useRef(currentBundleUrl);
  const latestBundleUrlRef = useRef(currentBundleUrl);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return undefined;
    }

    const normalizedCurrentUrl = getCurrentModuleUrl();
    bundleUrlRef.current = normalizedCurrentUrl;
    latestBundleUrlRef.current = normalizedCurrentUrl;
    setCurrentBundleUrl(normalizedCurrentUrl);
    setLatestBundleUrl(normalizedCurrentUrl);

    let cancelled = false;
    let intervalId = null;

    async function pollForUpdates() {
      try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        if (!response?.ok) return;
        const html = await response.text();
        const moduleUrl = extractModuleUrlFromHtml(html);
        const normalizedModuleUrl = normalizeModuleUrl(moduleUrl);
        if (!normalizedModuleUrl) return;

        if (latestBundleUrlRef.current !== normalizedModuleUrl) {
          latestBundleUrlRef.current = normalizedModuleUrl;
          if (!cancelled) {
            setLatestBundleUrl(normalizedModuleUrl);
          }
        }

        const previousUrl = bundleUrlRef.current;
        if (!previousUrl) {
          bundleUrlRef.current = normalizedModuleUrl;
          if (!cancelled) {
            setCurrentBundleUrl(normalizedModuleUrl);
          }
          return;
        }

        if (normalizedModuleUrl !== previousUrl) {
          if (!cancelled) {
            setHasUpdateAvailable((prev) => (prev ? prev : true));
          }
        }

        bundleUrlRef.current = normalizedModuleUrl;
      } catch (err) {
        if (typeof window !== 'undefined' && window.erpDebug) {
          console.warn('useBuildUpdateNotice: polling failed', err);
        }
      }
    }

    pollForUpdates();
    intervalId = window.setInterval(pollForUpdates, intervalMs);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [intervalMs]);

  return { hasUpdateAvailable, currentBundleUrl, latestBundleUrl };
}
