import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { API_BASE } from '../utils/apiBase.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 15000;
const MIN_SAMPLE_INTERVAL_MS = 3000;
const MAX_SAMPLE_INTERVAL_MS = 120000;
const FRAME_SAMPLE_MS = 1000;

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value)} ms`;
}

function formatMbps(value) {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(1)} Mbps`;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let current = value;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

async function sampleLatency(url, options = {}) {
  const start = performance.now();
  const response = await fetch(url, {
    method: options.method || 'GET',
    cache: 'no-store',
    credentials: options.credentials || 'include',
    headers: options.headers,
    signal: options.signal,
  });
  const duration = performance.now() - start;
  return {
    ok: response.ok,
    status: response.status,
    duration,
  };
}

export default function PerformanceStatsFloat() {
  const { t } = useTranslation(['translation']);
  const { userSettings } = useAuth();

  const isEnabled = userSettings?.performanceStatsEnabled ?? false;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [networkStats, setNetworkStats] = useState({
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    effectiveType: '-',
    downlink: null,
    rtt: null,
    internetLatency: null,
    serverLatency: null,
    serverStatus: '-',
    internetStatus: '-',
    lastUpdatedAt: null,
  });
  const [localStats, setLocalStats] = useState({
    fps: null,
    eventLoopLag: null,
    longTaskCount: 0,
    worstLongTask: null,
    jsHeapUsed: null,
    jsHeapLimit: null,
    navigation: null,
  });
  const longTaskRef = useRef({ count: 0, worst: 0 });

  const testUrl = useMemo(
    () => userSettings?.performanceProbeUrl || `${API_BASE}/auth/me`,
    [userSettings?.performanceProbeUrl],
  );
  const sampleIntervalMs = useMemo(() => {
    const raw = Number(userSettings?.performanceProbeIntervalMs);
    if (!Number.isFinite(raw)) return DEFAULT_SAMPLE_INTERVAL_MS;
    return Math.min(MAX_SAMPLE_INTERVAL_MS, Math.max(MIN_SAMPLE_INTERVAL_MS, Math.round(raw)));
  }, [userSettings?.performanceProbeIntervalMs]);

  useEffect(() => {
    if (!isEnabled) return undefined;

    let cancelled = false;
    let activeSampleController = null;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const updateConnectionStats = () => {
      if (cancelled) return;
      setNetworkStats((prev) => ({
        ...prev,
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        effectiveType: connection?.effectiveType || '-',
        downlink: toNumber(connection?.downlink),
        rtt: toNumber(connection?.rtt),
      }));
    };

    const longTaskObserver = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            longTaskRef.current.count += 1;
            longTaskRef.current.worst = Math.max(longTaskRef.current.worst, entry.duration || 0);
          });
        })
      : null;

    if (longTaskObserver) {
      try {
        longTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch (err) {
        console.warn('Long task observer unavailable', err);
      }
    }

    const readNavigationTiming = () => {
      try {
        const nav = performance.getEntriesByType('navigation')?.[0];
        if (!nav) return null;
        return {
          dns: nav.domainLookupEnd - nav.domainLookupStart,
          connect: nav.connectEnd - nav.connectStart,
          ttfb: nav.responseStart - nav.requestStart,
          total: nav.duration,
        };
      } catch {
        return null;
      }
    };

    let loopTimer;
    const loopIntervalMs = 1000;
    let expected = performance.now() + loopIntervalMs;
    const monitorLoopLag = () => {
      const now = performance.now();
      const drift = Math.max(0, now - expected);
      expected = now + loopIntervalMs;
      setLocalStats((prev) => ({ ...prev, eventLoopLag: drift }));
      loopTimer = window.setTimeout(monitorLoopLag, loopIntervalMs);
    };

    let rafId = 0;
    let frameCount = 0;
    let frameWindowStart = performance.now();
    const sampleFrames = (now) => {
      frameCount += 1;
      const elapsed = now - frameWindowStart;
      if (elapsed >= FRAME_SAMPLE_MS) {
        const fps = (frameCount * 1000) / elapsed;
        setLocalStats((prev) => ({ ...prev, fps }));
        frameCount = 0;
        frameWindowStart = now;
      }
      rafId = window.requestAnimationFrame(sampleFrames);
    };

    const runSample = async () => {
      if (cancelled) return;

      const controller = new AbortController();
      activeSampleController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      try {
        const [internet, server] = await Promise.allSettled([
          sampleLatency('/favicon.ico', { method: 'GET', credentials: 'same-origin', signal: controller.signal }),
          sampleLatency(testUrl, { method: 'GET', credentials: 'include', signal: controller.signal }),
        ]);

        if (cancelled || controller.signal.aborted) return;

        setNetworkStats((prev) => ({
          ...prev,
          internetLatency: internet.status === 'fulfilled' ? internet.value.duration : null,
          internetStatus:
            internet.status === 'fulfilled'
              ? `${internet.value.status} ${internet.value.ok ? 'OK' : 'ERR'}`
              : 'probe-failed',
          serverLatency: server.status === 'fulfilled' ? server.value.duration : null,
          serverStatus:
            server.status === 'fulfilled'
              ? `${server.value.status} ${server.value.ok ? 'OK' : 'ERR'}`
              : 'probe-failed',
          lastUpdatedAt: new Date().toISOString(),
        }));
      } finally {
        window.clearTimeout(timeout);
        if (activeSampleController === controller) {
          activeSampleController = null;
        }
      }

      if (cancelled) return;

      const memory = performance.memory;
      setLocalStats((prev) => ({
        ...prev,
        longTaskCount: longTaskRef.current.count,
        worstLongTask: longTaskRef.current.worst,
        jsHeapUsed: memory?.usedJSHeapSize ?? null,
        jsHeapLimit: memory?.jsHeapSizeLimit ?? null,
        navigation: prev.navigation || readNavigationTiming(),
      }));
    };

    const sampleInterval = window.setInterval(runSample, sampleIntervalMs);

    updateConnectionStats();
    window.addEventListener('online', updateConnectionStats);
    window.addEventListener('offline', updateConnectionStats);
    connection?.addEventListener?.('change', updateConnectionStats);

    monitorLoopLag();
    rafId = window.requestAnimationFrame(sampleFrames);
    runSample();

    return () => {
      cancelled = true;
      activeSampleController?.abort();
      window.clearInterval(sampleInterval);
      window.clearTimeout(loopTimer);
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('online', updateConnectionStats);
      window.removeEventListener('offline', updateConnectionStats);
      connection?.removeEventListener?.('change', updateConnectionStats);
      longTaskObserver?.disconnect();
    };
  }, [isEnabled, testUrl, sampleIntervalMs]);

  if (!isEnabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: isCollapsed ? 260 : 420,
        maxHeight: isCollapsed ? 52 : 'min(70vh, 560px)',
        overflow: 'auto',
        background: 'rgba(15, 23, 42, 0.96)',
        color: '#e2e8f0',
        border: '1px solid rgba(148, 163, 184, 0.4)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        zIndex: 15000,
        padding: '0.65rem 0.75rem',
        fontSize: '0.78rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('performance_stats_title', 'Live Performance Stats')}</strong>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          style={{
            border: '1px solid rgba(148, 163, 184, 0.5)',
            background: 'transparent',
            color: '#e2e8f0',
            borderRadius: 4,
            cursor: 'pointer',
            padding: '0.1rem 0.45rem',
          }}
        >
          {isCollapsed ? t('expand', 'Expand') : t('collapse', 'Collapse')}
        </button>
      </div>
      {!isCollapsed && (
        <div style={{ marginTop: '0.65rem', display: 'grid', gap: '0.6rem' }}>
          <section>
            <div style={{ color: '#93c5fd', fontWeight: 600 }}>
              {t('performance_web_server', 'Web server / API')}
            </div>
            <div>{t('performance_probe_url', 'Probe URL')}: {testUrl}</div>
            <div>{t('performance_server_latency', 'Server latency')}: {formatMs(networkStats.serverLatency)}</div>
            <div>{t('performance_server_status', 'Server status')}: {networkStats.serverStatus}</div>
          </section>

          <section>
            <div style={{ color: '#a7f3d0', fontWeight: 600 }}>
              {t('performance_local_system', 'Local browser/system')}
            </div>
            <div>{t('performance_fps', 'FPS')}: {Number.isFinite(localStats.fps) ? localStats.fps.toFixed(1) : '-'}</div>
            <div>{t('performance_event_loop_lag', 'Event loop lag')}: {formatMs(localStats.eventLoopLag)}</div>
            <div>{t('performance_long_tasks', 'Long tasks (>50ms)')}: {localStats.longTaskCount}</div>
            <div>{t('performance_worst_long_task', 'Worst long task')}: {formatMs(localStats.worstLongTask)}</div>
            <div>
              {t('performance_js_heap', 'JS heap')}: {formatBytes(localStats.jsHeapUsed)} / {formatBytes(localStats.jsHeapLimit)}
            </div>
            <div>
              {t('performance_nav_ttfb', 'Initial page TTFB')}: {formatMs(localStats.navigation?.ttfb)}
            </div>
          </section>

          <section>
            <div style={{ color: '#fcd34d', fontWeight: 600 }}>
              {t('performance_network', 'Internet / Network')}
            </div>
            <div>{t('performance_online', 'Online')}: {networkStats.online ? 'Yes' : 'No'}</div>
            <div>{t('performance_effective_type', 'Effective type')}: {networkStats.effectiveType || '-'}</div>
            <div>{t('performance_downlink', 'Downlink')}: {formatMbps(networkStats.downlink)}</div>
            <div>{t('performance_rtt', 'RTT')}: {formatMs(networkStats.rtt)}</div>
            <div>{t('performance_internet_latency', 'Internet latency')}: {formatMs(networkStats.internetLatency)}</div>
            <div>{t('performance_internet_status', 'Internet status')}: {networkStats.internetStatus}</div>
          </section>

          <div style={{ color: '#94a3b8' }}>
            {t('performance_last_updated', 'Last updated')}: {networkStats.lastUpdatedAt ? new Date(networkStats.lastUpdatedAt).toLocaleTimeString() : '-'}
          </div>
        </div>
      )}
    </div>
  );
}
