import { useEffect, useRef, useState } from 'react';

const MODULE_SELECTOR = 'script[type="module"][src]';
const MODULE_SRC_REGEX = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/i;

function getCurrentModuleUrl() {
  if (typeof document === 'undefined') return null;
  try {
    if (typeof document.querySelector === 'function') {
      const script = document.querySelector(MODULE_SELECTOR);
      if (script && typeof script.getAttribute === 'function') {
        return script.getAttribute('src');
      }
    }
  } catch (err) {
    console.warn('useBuildUpdateNotice: failed to read current module URL', err);
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
  const [latestBundleUrl, setLatestBundleUrl] = useState(null);
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false);
  const bundleUrlRef = useRef(currentBundleUrl);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return undefined;
    }

    bundleUrlRef.current = getCurrentModuleUrl();
    setCurrentBundleUrl(bundleUrlRef.current);

    let cancelled = false;
    let intervalId = null;

    async function pollForUpdates() {
      try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        if (!response?.ok) return;
        const html = await response.text();
        const moduleUrl = extractModuleUrlFromHtml(html);
        if (!moduleUrl) return;

        setLatestBundleUrl(moduleUrl);

        const previousUrl = bundleUrlRef.current;
        if (!previousUrl) {
          bundleUrlRef.current = moduleUrl;
          if (!cancelled) {
            setCurrentBundleUrl(moduleUrl);
          }
          return;
        }

        if (moduleUrl !== previousUrl) {
          if (!cancelled) {
            setHasUpdateAvailable(true);
          }
        }
      } catch (err) {
        console.warn('useBuildUpdateNotice: polling failed', err);
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
