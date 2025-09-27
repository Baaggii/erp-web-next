// src/erp.mgt.mn/components/ERPLayout.jsx
import React, { useContext, useState, useEffect, useRef, useMemo, useCallback } from "react";
import HeaderMenu from "./HeaderMenu.jsx";
import UserMenu from "./UserMenu.jsx";
import { useOutlet, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext.jsx";
import LangContext from "../context/I18nContext.jsx";
import { logout } from "../hooks/useAuth.jsx";
import { useModules } from "../hooks/useModules.js";
import { useTxnModules } from "../hooks/useTxnModules.js";
import modulePath from "../utils/modulePath.js";
import AskAIFloat from "./AskAIFloat.jsx";
import useGeneralConfig from "../hooks/useGeneralConfig.js";
import { useTabs } from "../context/TabContext.jsx";
import { useIsLoading } from "../context/LoadingContext.jsx";
import Spinner from "./Spinner.jsx";
import useHeaderMappings from "../hooks/useHeaderMappings.js";
import useRequestNotificationCounts from "../hooks/useRequestNotificationCounts.js";
import { PendingRequestContext } from "../context/PendingRequestContext.jsx";
import Joyride, { STATUS, ACTIONS, EVENTS } from "react-joyride";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { API_BASE } from "../utils/apiBase.js";
import TourBuilder from "./tours/TourBuilder.jsx";
import TourViewer from "./tours/TourViewer.jsx";
import derivePageKey from "../utils/derivePageKey.js";
import { findVisibleFallbackSelector } from "../utils/findVisibleTourStep.js";

export const TourContext = React.createContext({
  startTour: () => false,
  getTourForPath: () => undefined,
  registryVersion: 0,
  openTourBuilder: () => {},
  closeTourBuilder: () => {},
  openTourViewer: () => {},
  closeTourViewer: () => {},
  tourBuilderState: null,
  tourViewerState: null,
  tourStepIndex: 0,
  activeTourRunId: 0,
  ensureTourDefinition: () => Promise.resolve(null),
  saveTourDefinition: () => Promise.resolve(null),
  deleteTourDefinition: () => Promise.resolve(false),
});
export const useTour = (pageKey, options = {}) => {
  const { startTour, ensureTourDefinition } = useContext(TourContext);
  const { userSettings } = useContext(AuthContext);
  const location = useLocation();

  const { forceReload, path, ...restOptions } = options || {};
  const memoizedRestOptions = useMemo(
    () => restOptions,
    [JSON.stringify(restOptions)],
  );

  useEffect(() => {
    if (!pageKey || typeof ensureTourDefinition !== 'function') return undefined;
    const controller = new AbortController();
    let isMounted = true;

    const targetPath = path ?? location.pathname;

    async function load() {
      try {
        const entry = await ensureTourDefinition({
          pageKey,
          path: targetPath,
          forceReload,
          signal: controller.signal,
        });
        if (!isMounted) return;
        const steps = Array.isArray(entry?.steps) ? entry.steps : [];
        const resolvedPath = entry?.path || targetPath;
        startTour(pageKey, steps, { ...memoizedRestOptions, path: resolvedPath });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to load tour definition', err);
      }
    }

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    ensureTourDefinition,
    forceReload,
    location.pathname,
    memoizedRestOptions,
    pageKey,
    path,
    startTour,
    userSettings,
  ]);
};

const cryptoSource = typeof globalThis !== 'undefined' ? globalThis.crypto : null;

function createClientStepId() {
  if (cryptoSource?.randomUUID) {
    return cryptoSource.randomUUID();
  }
  return `client-step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function coerceSelectorValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeSelectorList(selectors, fallback) {
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
    const fallbackValue = typeof fallback === "string" ? fallback.trim() : "";
    if (fallbackValue) normalized.push(fallbackValue);
  }
  return normalized;
}

function normalizeClientStep(step, index = 0) {
  if (!step || typeof step !== 'object') return null;
  const selectorRaw =
    typeof step.selector === 'string' && step.selector.trim()
      ? step.selector.trim()
      : typeof step.target === 'string' && step.target.trim()
        ? step.target.trim()
        : '';
  const selectors = normalizeSelectorList(step.selectors, selectorRaw);
  const selector = selectors[0] || '';
  const content =
    typeof step.content === 'string' || typeof step.content === 'number'
      ? String(step.content)
      : '';
  const order =
    typeof step.order === 'number' && Number.isFinite(step.order) ? step.order : index;
  const placement =
    typeof step.placement === 'string' && step.placement.trim()
      ? step.placement.trim()
      : typeof step.position === 'string' && step.position.trim()
        ? step.position.trim()
        : 'bottom';
  const title = typeof step.title === 'string' ? step.title : undefined;
  const offset =
    step.offset !== undefined && !Number.isNaN(Number(step.offset))
      ? Number(step.offset)
      : undefined;
  const spotlightPadding =
    step.spotlightPadding !== undefined && !Number.isNaN(Number(step.spotlightPadding))
      ? Number(step.spotlightPadding)
      : undefined;

  const normalized = {
    id:
      typeof step.id === 'string' && step.id.trim() ? step.id.trim() : createClientStepId(),
    selectors,
    selector,
    target: selector || '',
    content,
    placement,
    order,
  };

  if (title !== undefined && title !== '') normalized.title = title;
  if (offset !== undefined) normalized.offset = offset;
  if (spotlightPadding !== undefined) normalized.spotlightPadding = spotlightPadding;
  if (step.disableBeacon !== undefined) normalized.disableBeacon = Boolean(step.disableBeacon);
  if (step.isFixed !== undefined) normalized.isFixed = Boolean(step.isFixed);
  if (step.locale) normalized.locale = step.locale;
  if (step.tooltip) normalized.tooltip = step.tooltip;
  if (step.styles && typeof step.styles === 'object') normalized.styles = step.styles;
  if (step.floaterProps && typeof step.floaterProps === 'object') {
    normalized.floaterProps = step.floaterProps;
  }

  if (selectors.length) {
    normalized.highlightSelectors = selectors;
  }

  return normalized;
}

function computeStepSignature(steps) {
  if (!Array.isArray(steps)) return '[]';
  return JSON.stringify(
    steps.map((step) => ({
      id: step.id,
      selector: step.selector,
      selectors: Array.isArray(step.selectors) ? step.selectors : [],
      content: step.content,
      placement: step.placement,
      order: step.order,
      title: step.title ?? '',
      offset: step.offset ?? null,
      spotlightPadding: step.spotlightPadding ?? null,
      disableBeacon: step.disableBeacon ?? false,
      isFixed: step.isFixed ?? false,
    })),
  );
}

function JoyrideTooltip({
  index = 0,
  step,
  tooltipProps = {},
  helpers = {},
  backProps = {},
  primaryProps = {},
  skipProps = {},
}) {
  const canGoBack = index > 0;
  const backLabel = step?.locale?.back || 'Back';
  const nextLabel = step?.locale?.next || 'Next';
  const endLabel =
    step?.locale?.last || step?.locale?.close || step?.locale?.skip || 'End tour';

  const {
    className: backClassName,
    onClick: backOnClick,
    disabled: backDisabled,
    ...restBackProps
  } = backProps || {};
  const {
    className: primaryClassName,
    onClick: primaryOnClick,
    ...restPrimaryProps
  } = primaryProps || {};
  const {
    className: skipClassName,
    onClick: skipOnClick,
    ...restSkipProps
  } = skipProps || {};

  const handleBack = (event) => {
    if (typeof backOnClick === 'function') {
      backOnClick(event);
      return;
    }
    if (typeof helpers.goBack === 'function') {
      helpers.goBack(event);
    }
  };

  const handleNext = (event) => {
    if (typeof primaryOnClick === 'function') {
      primaryOnClick(event);
      return;
    }
    if (typeof helpers.next === 'function') {
      helpers.next(event);
    }
  };

  const handleEnd = (event) => {
    if (typeof skipOnClick === 'function') {
      skipOnClick(event);
      return;
    }
    if (typeof helpers.close === 'function') {
      helpers.close(true);
    }
  };

  return (
    <div
      {...tooltipProps}
      className={`react-joyride__tooltip ${tooltipProps?.className ?? ''}`.trim()}
    >
      {step?.title ? (
        <div className="react-joyride__tooltip-header">
          <h3 className="react-joyride__tooltip-title">{step.title}</h3>
        </div>
      ) : null}
      <div className="react-joyride__tooltip-content">
        {step?.content}
        {step?.missingTarget ? (
          <div
            className="react-joyride__tooltip-missing-target"
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgb(251 146 60)',
              backgroundColor: 'rgba(254, 243, 199, 0.45)',
              color: 'rgb(154 52 18)',
              fontWeight: 600,
            }}
          >
            {step.missingTarget}
          </div>
        ) : null}
      </div>
      <div
        className="react-joyride__tooltip-footer"
        style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'flex-end',
          marginTop: '1rem',
        }}
      >
        <button
          type="button"
          className={`react-joyride__tooltip-button react-joyride__tooltip-button--back ${backClassName ?? ''}`.trim()}
          onClick={handleBack}
          disabled={backDisabled ?? !canGoBack}
          {...restBackProps}
        >
          {backLabel}
        </button>
        <button
          type="button"
          className={`react-joyride__tooltip-button react-joyride__tooltip-button--primary ${primaryClassName ?? ''}`.trim()}
          onClick={handleNext}
          {...restPrimaryProps}
        >
          {nextLabel}
        </button>
        <button
          type="button"
          className={`react-joyride__tooltip-button react-joyride__tooltip-button--skip ${skipClassName ?? ''}`.trim()}
          onClick={handleEnd}
          {...restSkipProps}
        >
          {endLabel}
        </button>
      </div>
    </div>
  );
}

function stripStepForSave(step) {
  if (!step || typeof step !== 'object') return step;
  const { target, highlightSelectors, __runId, ...rest } = step;
  return rest;
}

/**
 * A desktop‐style “ERPLayout” with:
 *  - Top header bar (logo, nav icons, user dropdown)
 *  - Left sidebar (menu groups + items)
 *  - Main content area (faux window container)
 */
export default function ERPLayout() {
  const { user, setUser, session, userSettings, updateUserSettings } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const { t } = useContext(LangContext);
  const renderCount = useRef(0);
  useEffect(() => {
  renderCount.current++;
  if (renderCount.current > 10) {
    console.warn('ERPLayout re-rendering too many times', renderCount.current);
  }
}, []);
  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: ERPLayout');
  }, []);
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tourSteps, setTourSteps] = useState([]);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [runTour, setRunTour] = useState(false);
  const tourRunIdRef = useRef(0);
  const activeTourRunIdRef = useRef(0);
  const [activeTourRunId, setActiveTourRunId] = useState(0);
  const [currentTourPage, setCurrentTourPage] = useState('');
  const [currentTourPath, setCurrentTourPath] = useState('');
  const toursByPageRef = useRef({});
  const toursByPathRef = useRef({});
  const [tourRegistryVersion, setTourRegistryVersion] = useState(0);
  const [tourBuilderState, setTourBuilderState] = useState(null);
  const [tourViewerState, setTourViewerState] = useState(null);
  const joyrideScrollOffset = 56;
  const extraSpotlightsRef = useRef([]);
  const extraSpotlightContainerRef = useRef(null);
  const removeExtraSpotlights = useCallback(() => {
    extraSpotlightsRef.current.forEach((entry) => {
      const overlay = entry?.overlay;
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    extraSpotlightsRef.current = [];

    const container = extraSpotlightContainerRef.current;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    extraSpotlightContainerRef.current = null;
  }, []);
  const openTourBuilder = useCallback((state) => {
    if (!state) return;
    setTourBuilderState(state);
  }, []);
  const closeTourBuilder = useCallback(() => {
    setTourBuilderState(null);
  }, []);

  const normalizePath = useCallback((path) => {
    if (!path) return '/';
    const [cleanWithoutHash] = path.split('#');
    const [cleanPath] = (cleanWithoutHash || path).split('?');
    return cleanPath || '/';
  }, []);

  const openTourViewer = useCallback(
    (state) => {
      if (!state) return;
      const normalized = state.path ? normalizePath(state.path) : '';
      setCurrentTourPath(normalized);
      setTourStepIndex(0);
      setTourViewerState(state);
    },
    [normalizePath],
  );
  const closeTourViewer = useCallback(() => {
    setTourViewerState(null);
  }, []);

  const endTour = useCallback(() => {
    removeExtraSpotlights();
    setRunTour(false);
    setTourSteps([]);
    setTourStepIndex(0);
    setCurrentTourPage("");
    setCurrentTourPath("");
    closeTourViewer();
  }, [closeTourViewer, removeExtraSpotlights]);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const registerTourEntry = useCallback(
    (pageKey, stepsInput = [], pathValue) => {
      if (!pageKey) return null;
      const normalizedPath = normalizePath(pathValue ?? '/');
      const normalizedSteps = Array.isArray(stepsInput)
        ? stepsInput
            .map((step, index) => normalizeClientStep(step, index))
            .filter(Boolean)
        : [];
      normalizedSteps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      normalizedSteps.forEach((step, index) => {
        step.order = index;
        step.target = step.selector || step.target || '';
      });
      const signature = computeStepSignature(normalizedSteps);
      const existingEntry = toursByPageRef.current[pageKey];
      if (existingEntry?.path && existingEntry.path !== normalizedPath) {
        delete toursByPathRef.current[existingEntry.path];
      }
      const changed =
        !existingEntry ||
        existingEntry.path !== normalizedPath ||
        existingEntry.signature !== signature;
      const storedEntry = {
        pageKey,
        steps: normalizedSteps,
        path: normalizedPath,
        signature,
      };
      toursByPageRef.current[pageKey] = storedEntry;
      if (normalizedPath) {
        toursByPathRef.current[normalizedPath] = storedEntry;
      }
      if (changed) {
        setTourRegistryVersion((v) => v + 1);
      }
      return storedEntry;
    },
    [normalizePath],
  );

  const startTour = useCallback(
    (pageKey, stepsInput = [], options = {}) => {
      if (!pageKey) return false;
      const targetPath = options?.path ?? location.pathname;
      const entry = registerTourEntry(pageKey, stepsInput, targetPath);
      const normalizedSteps = entry?.steps || [];
      const runnableSteps = normalizedSteps.filter((step) => step.target);
      if (!runnableSteps.length) return false;

      const requestedIndex = Number.isFinite(options?.stepIndex)
        ? Number(options.stepIndex)
        : 0;
      const initialStepIndex = Math.min(
        Math.max(0, requestedIndex),
        runnableSteps.length - 1,
      );

      const toursEnabled = userSettings?.settings_enable_tours ?? false;
      if (!toursEnabled && !options?.force) return false;

      const seen = userSettings?.toursSeen || {};
      const alreadySeen = !!seen[pageKey];

      if (options?.force && alreadySeen) {
        const updatedSeen = { ...seen };
        delete updatedSeen[pageKey];
        if (updateUserSettings) {
          updateUserSettings({ toursSeen: updatedSeen });
        }
      }

      if (options?.force || !alreadySeen) {
        const nextRunId = tourRunIdRef.current + 1;
        tourRunIdRef.current = nextRunId;
        activeTourRunIdRef.current = nextRunId;
        setActiveTourRunId(nextRunId);

        const joyrideSteps = runnableSteps.map((step) => ({
          ...step,
          target: step.target || step.selector || step.id,
          __runId: nextRunId,
        }));
        removeExtraSpotlights();
        setTourStepIndex(initialStepIndex);
        setTourSteps(joyrideSteps);
        setCurrentTourPage(pageKey);
        setCurrentTourPath(entry?.path || normalizePath(targetPath));
        setRunTour(true);
        return true;
      }

      return false;
    },
    [
      location.pathname,
      normalizePath,
      registerTourEntry,
      removeExtraSpotlights,
      updateUserSettings,
      userSettings,
    ],
  );

  const ensureTourDefinition = useCallback(
    async ({ pageKey, path, forceReload = false, signal } = {}) => {
      const normalizedPath = normalizePath(path ?? location.pathname);
      if (!forceReload) {
        if (pageKey) {
          const existing = toursByPageRef.current[pageKey];
          if (existing && (!normalizedPath || existing.path === normalizedPath)) {
            return existing;
          }
        } else if (normalizedPath) {
          const existingByPath = toursByPathRef.current[normalizedPath];
          if (existingByPath) return existingByPath;
        }
      }

      const params = new URLSearchParams();
      if (pageKey) params.set('pageKey', pageKey);
      if (normalizedPath) params.set('path', normalizedPath);

      const res = await fetch(`${API_BASE}/tours?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to load tour definition (${res.status})`);
      }
      const data = await res.json();
      const resolvedPageKey = data?.pageKey || pageKey;
      const resolvedPath = data?.path || normalizedPath;
      const serverSteps = Array.isArray(data?.steps) ? data.steps : [];
      if (!resolvedPageKey) {
        return null;
      }
      return (
        registerTourEntry(resolvedPageKey, serverSteps, resolvedPath) || {
          pageKey: resolvedPageKey,
          path: normalizePath(resolvedPath),
          steps: [],
        }
      );
    },
    [location.pathname, normalizePath, registerTourEntry],
  );

  const removeTourEntry = useCallback((pageKey) => {
    if (!pageKey) return;
    const existing = toursByPageRef.current[pageKey];
    if (!existing) return;
    if (existing.path) {
      const stored = toursByPathRef.current[existing.path];
      if (stored?.pageKey === pageKey) {
        delete toursByPathRef.current[existing.path];
      }
    }
    delete toursByPageRef.current[pageKey];
    setTourRegistryVersion((v) => v + 1);
  }, []);

  const deleteTourDefinition = useCallback(
    async (pageKey) => {
      if (!pageKey) return false;
      const res = await fetch(`${API_BASE}/tours/${encodeURIComponent(pageKey)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to delete tour definition');
      }
      await res.json().catch(() => ({}));
      removeTourEntry(pageKey);
      return true;
    },
    [removeTourEntry],
  );

  const saveTourDefinition = useCallback(
    async ({ pageKey, path, steps: stepsInput, previousPageKey } = {}) => {
      if (!pageKey) {
        throw new Error('A pageKey is required to save a tour');
      }
      const normalizedSteps = Array.isArray(stepsInput)
        ? stepsInput
            .map((step, index) => normalizeClientStep(step, index))
            .filter(Boolean)
        : [];
      normalizedSteps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      normalizedSteps.forEach((step, index) => {
        step.order = index;
        step.target = step.selector || step.target || '';
      });
      const payload = {
        path,
        steps: normalizedSteps.map(stripStepForSave),
      };
      const res = await fetch(`${API_BASE}/tours/${encodeURIComponent(pageKey)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to save tour definition');
      }
      const data = await res.json();
      const entry = registerTourEntry(
        data?.pageKey || pageKey,
        data?.steps || payload.steps,
        data?.path ?? path,
      );
      if (previousPageKey && previousPageKey !== entry?.pageKey) {
        try {
          await deleteTourDefinition(previousPageKey);
        } catch (err) {
          console.error('Failed to delete previous tour definition', err);
        }
      }
      return entry;
    },
    [deleteTourDefinition, registerTourEntry],
  );

  const getTourForPath = useCallback(
    (path) => {
      const key = normalizePath(path);
      return toursByPathRef.current[key];
    },
    [normalizePath],
  );

  const modules = useModules();
  const moduleMap = useMemo(() => {
    const map = {};
    modules.forEach((m) => {
      map[m.module_key] = m;
    });
    return map;
  }, [modules]);
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));
  const titleMap = useMemo(() => {
    const map = { "/": t("dashboard", "Dashboard") };
    if (moduleMap.forms) map[modulePath(moduleMap.forms, moduleMap)] = t("forms", "Forms");
    if (moduleMap.reports) map[modulePath(moduleMap.reports, moduleMap)] = t("reports", "Reports");
    if (moduleMap.settings)
      map[modulePath(moduleMap.settings, moduleMap)] = t("settings", "Settings");
    if (moduleMap.users)
      map[modulePath(moduleMap.users, moduleMap)] = t("settings_users", "Users");
    if (moduleMap.user_settings)
      map[modulePath(moduleMap.user_settings, moduleMap)] = t(
        "settings_user_settings",
        "User Settings",
      );
    if (moduleMap.role_permissions)
      map[modulePath(moduleMap.role_permissions, moduleMap)] = t(
        "settings_role_permissions",
        "Role Permissions",
      );
    if (moduleMap.modules)
      map[modulePath(moduleMap.modules, moduleMap)] = t("settings_modules", "Modules");
    if (moduleMap.company_licenses)
      map[modulePath(moduleMap.company_licenses, moduleMap)] = t(
        "settings_company_licenses",
        "Company Licenses",
      );
    if (moduleMap.tables_management)
      map[modulePath(moduleMap.tables_management, moduleMap)] = t(
        "settings_tables_management",
        "Tables Management",
      );
    if (moduleMap.forms_management)
      map[modulePath(moduleMap.forms_management, moduleMap)] = t(
        "settings_forms_management",
        "Forms Management",
      );
    if (moduleMap.report_management)
      map[modulePath(moduleMap.report_management, moduleMap)] = t(
        "settings_report_management",
        "Report Management",
      );
    if (moduleMap.change_password)
      map[modulePath(moduleMap.change_password, moduleMap)] = t(
        "settings_change_password",
        "Change Password",
      );
    if (moduleMap.tenant_tables_registry)
      map[modulePath(moduleMap.tenant_tables_registry, moduleMap)] = t(
        "settings_tenant_tables_registry",
        "Tenant Tables Registry",
      );
    if (moduleMap.edit_translations)
      map[modulePath(moduleMap.edit_translations, moduleMap)] = t(
        "settings_translations",
        "Edit Translations",
      );
    return map;
  }, [moduleMap, t]);
  const validPaths = useMemo(() => {
    const paths = new Set(["/"]);
    modules.forEach((m) => {
      paths.add(modulePath(m, moduleMap));
    });
    return paths;
  }, [modules, moduleMap]);
  const { addToast } = useToast();

  function titleForPath(path) {
    if (titleMap[path]) return titleMap[path];
    const seg = path.replace(/^\/+/, '').split('/')[0];
    const mod = modules.find(
      (m) => m.module_key.replace(/_/g, '-') === seg,
    );
    if (!mod) return t('appName', 'ERP');
    return (
      generalConfig.general?.procLabels?.[mod.module_key] ||
      headerMap[mod.module_key] ||
      mod.label
    );
  }

  const windowTitle = titleForPath(location.pathname);
  useEffect(() => {
    if (!modules.length) return;
    if (!validPaths.has(location.pathname)) {
      addToast(t("route_disabled", "This route is disabled"), "error");
      navigate("/");
    }
  }, [modules, validPaths, location.pathname, navigate, addToast, t]);

  const handleTourCallback = useCallback(
    (data) => {
      const { status, index, type, action, step } = data;
      const defer =
        typeof queueMicrotask === "function"
          ? queueMicrotask
          : (cb) => {
              setTimeout(cb, 0);
            };

      defer(() => {
        if (Number.isFinite(index)) {
          const eventRunId = step?.__runId;
          const isCurrentRun =
            eventRunId === undefined || eventRunId === activeTourRunIdRef.current;
          const clampIndex = (value) =>
            Math.min(Math.max(0, value), Math.max(tourSteps.length - 1, 0));
          const updateViewerIndex = (nextIndex) => {
            setTourViewerState((prev) =>
              prev ? { ...prev, currentStepIndex: nextIndex } : prev,
            );
          };

          if (type === EVENTS.STEP_BEFORE || type === EVENTS.TOOLTIP_OPEN) {
            const clampedIndex = clampIndex(index);
            setTourStepIndex(clampedIndex);
            if (isCurrentRun) {
              updateViewerIndex(clampedIndex);
              if (type === EVENTS.TOOLTIP_OPEN) {
                setTourSteps((prevSteps) => {
                  if (!Array.isArray(prevSteps)) return prevSteps;
                  const targetStep = prevSteps[clampedIndex];
                  if (!targetStep || typeof targetStep !== "object") {
                    return prevSteps;
                  }

                  const nextSteps = [...prevSteps];
                  const storedOriginal =
                    typeof targetStep.missingTargetOriginalTarget === "string"
                      ? targetStep.missingTargetOriginalTarget.trim()
                      : "";

                  let shouldRestore = false;
                  if (storedOriginal) {
                    let originalVisible = false;
                    if (typeof document !== "undefined" && document?.querySelector) {
                      try {
                        originalVisible = Boolean(
                          document.querySelector(storedOriginal),
                        );
                      } catch (err) {
                        originalVisible = false;
                      }
                    }
                    if (originalVisible) {
                      const {
                        missingTargetOriginalTarget,
                        missingTarget,
                        ...restStep
                      } = targetStep;
                      nextSteps[clampedIndex] = {
                        ...restStep,
                        target: storedOriginal,
                      };
                      shouldRestore = true;
                    }
                  } else if (targetStep.missingTarget !== undefined) {
                    const { missingTarget, ...restStep } = targetStep;
                    nextSteps[clampedIndex] = restStep;
                    shouldRestore = true;
                  }

                  return shouldRestore ? nextSteps : prevSteps;
                });
              }
            }
          } else if (type === EVENTS.STEP_AFTER && isCurrentRun) {
            const delta = action === ACTIONS.PREV ? -1 : 1;
            const nextIndex = clampIndex(index + delta);
            setTourStepIndex(nextIndex);
            updateViewerIndex(nextIndex);
          } else if (type === EVENTS.TARGET_NOT_FOUND && isCurrentRun) {
            const clampedIndex = clampIndex(index);
            const fallbackMessage = t(
              "tour_missing_target_hint",
              "Expand the referenced control to continue the tour.",
            );
            setTourSteps((prevSteps) => {
              if (!Array.isArray(prevSteps)) return prevSteps;
              if (clampedIndex < 0 || clampedIndex >= prevSteps.length) {
                return prevSteps;
              }

              const currentStep = prevSteps[clampedIndex];
              if (!currentStep || typeof currentStep !== "object") {
                return prevSteps;
              }

              const fallbackSelector = findVisibleFallbackSelector(currentStep);
              if (!fallbackSelector) {
                return prevSteps;
              }

              const messageExists =
                typeof currentStep.missingTarget === "string" &&
                currentStep.missingTarget.includes(fallbackMessage);

              const nextStep = {
                ...currentStep,
                target: fallbackSelector,
                missingTarget: messageExists
                  ? currentStep.missingTarget
                  : typeof currentStep.missingTarget === "string" &&
                      currentStep.missingTarget.trim().length
                    ? `${currentStep.missingTarget}\n${fallbackMessage}`
                    : fallbackMessage,
              };

              const existingOriginal =
                typeof currentStep.missingTargetOriginalTarget === "string"
                  ? currentStep.missingTargetOriginalTarget.trim()
                  : "";
              const trimmedTarget =
                typeof currentStep.target === "string"
                  ? currentStep.target.trim()
                  : "";
              const trimmedSelector =
                typeof currentStep.selector === "string"
                  ? currentStep.selector.trim()
                  : "";

              if (!existingOriginal) {
                if (trimmedTarget && trimmedTarget !== fallbackSelector) {
                  nextStep.missingTargetOriginalTarget = trimmedTarget;
                } else if (
                  trimmedSelector &&
                  trimmedSelector !== fallbackSelector
                ) {
                  nextStep.missingTargetOriginalTarget = trimmedSelector;
                }
              } else {
                nextStep.missingTargetOriginalTarget = existingOriginal;
              }

              const shouldUpdate =
                nextStep.target !== currentStep.target ||
                nextStep.missingTarget !== currentStep.missingTarget ||
                nextStep.missingTargetOriginalTarget !==
                  currentStep.missingTargetOriginalTarget;

              if (!shouldUpdate) {
                return prevSteps;
              }

              const nextSteps = [...prevSteps];
              nextSteps[clampedIndex] = nextStep;
              return nextSteps;
            });
            setTourStepIndex(clampedIndex);
            updateViewerIndex(clampedIndex);
          }
        }

        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
          if (currentTourPage) {
            const seen = { ...(userSettings?.toursSeen || {}), [currentTourPage]: true };
            updateUserSettings({ toursSeen: seen });
          }
          endTour();
        }
      });
    },
    [
      addToast,
      currentTourPage,
      endTour,
      t,
      tourSteps,
      updateUserSettings,
      userSettings,
    ],
  );

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }
    if (!runTour) {
      removeExtraSpotlights();
      return undefined;
    }
    const step = tourSteps[tourStepIndex];
    if (!step) {
      removeExtraSpotlights();
      return undefined;
    }
    removeExtraSpotlights();
    const baseSelectors = Array.isArray(step.highlightSelectors)
      ? step.highlightSelectors
      : Array.isArray(step.selectors)
        ? step.selectors
        : [];
    const trimmedSelectors = baseSelectors
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    if (trimmedSelectors.length <= 1) {
      return undefined;
    }
    const extraSelectors = trimmedSelectors.slice(1);
    const overlayEntries = [];
    const paddingValue = Number(step.spotlightPadding);
    const padding = Number.isFinite(paddingValue) ? paddingValue : 10;

    let container = extraSpotlightContainerRef.current;
    if (!container) {
      container = document.createElement("div");
      container.className = "tour-extra-spotlight-container";
      Object.assign(container.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        pointerEvents: "none",
        zIndex: 10000,
      });
      document.body.appendChild(container);
      extraSpotlightContainerRef.current = container;
    }

    extraSelectors.forEach((selector) => {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch (err) {
        console.warn("Invalid selector for tour spotlight", selector, err);
        return;
      }
      elements.forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        const overlay = document.createElement("div");
        overlay.className = "tour-extra-spotlight";
        Object.assign(overlay.style, {
          position: "absolute",
          borderRadius: "12px",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          boxShadow:
            "0 0 0 2px rgba(56, 189, 248, 0.55), 0 12px 24px rgba(15, 23, 42, 0.25)",
          pointerEvents: "none",
          zIndex: 10000,
          transition: "all 0.15s ease",
        });
        container.appendChild(overlay);
        overlayEntries.push({ overlay, element, padding });
      });
    });

    if (!overlayEntries.length) {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      extraSpotlightContainerRef.current = null;
      return undefined;
    }

    const updatePositions = () => {
      overlayEntries.forEach(({ overlay, element, padding: paddingAmount }) => {
        const rect = element.getBoundingClientRect();
        const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
        const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
        const top = scrollY + rect.top - paddingAmount;
        const left = scrollX + rect.left - paddingAmount;
        const width = rect.width + paddingAmount * 2;
        const height = rect.height + paddingAmount * 2;
        overlay.style.top = `${Math.floor(top)}px`;
        overlay.style.left = `${Math.floor(left)}px`;
        overlay.style.width = `${Math.max(0, Math.ceil(width))}px`;
        overlay.style.height = `${Math.max(0, Math.ceil(height))}px`;
      });
    };

    updatePositions();

    let rafId = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePositions();
      });
    };

    const handleScroll = () => scheduleUpdate();
    const handleResize = () => scheduleUpdate();

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize, true);

    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      overlayEntries.forEach(({ element }) => resizeObserver.observe(element));
    }

    extraSpotlightsRef.current = overlayEntries;

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize, true);
      if (resizeObserver) resizeObserver.disconnect();
      removeExtraSpotlights();
    };
  }, [removeExtraSpotlights, runTour, tourStepIndex, tourSteps]);

  useEffect(() => {
    if (!currentTourPath) return;
    const normalizedLocationPath = normalizePath(location.pathname);
    if (normalizedLocationPath === currentTourPath) return;
    if (!(runTour || tourViewerState)) return;

    endTour();
  }, [
    currentTourPath,
    endTour,
    location.pathname,
    normalizePath,
    runTour,
    tourViewerState,
  ]);

  useEffect(() => () => removeExtraSpotlights(), [removeExtraSpotlights]);

  const handleTourStepJump = useCallback(
    (stepIndex) => {
      if (!tourViewerState?.pageKey) return;
      const steps = Array.isArray(tourViewerState.steps) ? tourViewerState.steps : [];
      if (!steps.length) return;
      const numericIndex = Number(stepIndex);
      const safeIndex = Number.isFinite(numericIndex) ? numericIndex : 0;
      const clampedIndex = Math.min(Math.max(0, safeIndex), steps.length - 1);
      setTourStepIndex(clampedIndex);
      startTour(tourViewerState.pageKey, steps, {
        force: true,
        path: tourViewerState.path || location.pathname,
        stepIndex: clampedIndex,
      });
    },
    [location.pathname, startTour, tourViewerState],
  );

  const resetGuide = useCallback(() => {
    const normalized = normalizePath(location.pathname);
    const existing = getTourForPath(normalized);
    if (existing?.steps?.length) {
      startTour(existing.pageKey, existing.steps, { force: true, path: normalized });
    }
  }, [getTourForPath, location.pathname, normalizePath, startTour]);

  const {
    tabs,
    activeKey,
    openTab,
    closeTab,
    switchTab,
    setTabContent,
    cache,
    resetTabs,
  } = useTabs();
  const txnModules = useTxnModules();

  const seniorEmpId =
    session && user?.empid && !(Number(session.senior_empid) > 0)
      ? user.empid
      : null;
  const requestNotifications = useRequestNotificationCounts(
    seniorEmpId,
    undefined,
    user?.empid,
  );

  useEffect(() => {
    const title = titleForPath(location.pathname);
    openTab({ key: location.pathname, label: title });
  }, [location.pathname, openTab]);

  function handleOpen(path, label, key) {
    if (txnModules && txnModules.keys.has(key)) {
      openTab({ key: path, label });
      navigate(path);
    } else {
      openTab({ key: path, label });
      navigate(path);
    }
  }

  async function handleLogout() {
    await logout(user?.empid);
    resetTabs();
    setUser(null);
    navigate("/login");
  }

  function handleHome() {
    navigate('/');
  }

  const tourContextValue = useMemo(
    () => ({
      startTour,
      getTourForPath,
      registryVersion: tourRegistryVersion,
      openTourBuilder,
      closeTourBuilder,
      openTourViewer,
      closeTourViewer,
      tourBuilderState,
      tourViewerState,
      tourStepIndex,
      activeTourRunId,
      ensureTourDefinition,
      saveTourDefinition,
      deleteTourDefinition,
    }),
    [
      deleteTourDefinition,
      ensureTourDefinition,
      closeTourBuilder,
      closeTourViewer,
      getTourForPath,
      openTourBuilder,
      openTourViewer,
      saveTourDefinition,
      startTour,
      tourBuilderState,
      tourRegistryVersion,
      tourStepIndex,
      tourViewerState,
      activeTourRunId,
    ],
  );

  return (
    <TourContext.Provider value={tourContextValue}>
      {tourBuilderState && (
        <TourBuilder state={tourBuilderState} onClose={closeTourBuilder} />
      )}
      {tourViewerState && (
        <TourViewer
          state={{
            ...tourViewerState,
            currentStepIndex: tourStepIndex,
            runId: activeTourRunId,
          }}
          onClose={closeTourViewer}
          onEndTour={endTour}
          onSelectStep={handleTourStepJump}
        />
      )}
      <PendingRequestContext.Provider value={requestNotifications}>
        <div style={styles.container}>
          <Joyride
            steps={tourSteps}
            run={runTour}
            stepIndex={tourStepIndex}
            continuous
            spotlightClicks
            scrollOffset={joyrideScrollOffset}
            scrollToFirstStep
            scrollToSteps
            showBackButton
            showProgress
            disableOverlayClose
            disableBeacon
            disableKeyboardNavigation={false}
            floaterProps={{ offset: joyrideScrollOffset }}
            styles={{
              overlay: {
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
              },
              spotlight: {
                borderRadius: 12,
                boxShadow:
                  '0 0 0 2px rgba(56, 189, 248, 0.55), 0 0 0 9999px rgba(15, 23, 42, 0.65)',
              },
            }}
            callback={handleTourCallback}
            tooltipComponent={JoyrideTooltip}
            locale={{
              back: 'Back',
              close: 'End tour',
              last: 'End tour',
              next: 'Next',
            }}
          />
          <Header
            user={user}
            onLogout={handleLogout}
            onHome={handleHome}
            isMobile={isMobile}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            onOpen={handleOpen}
            onResetGuide={resetGuide}
          />
          <div style={styles.body(isMobile)}>
            {isMobile && sidebarOpen && (
              <div
                className="sidebar-overlay"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <Sidebar
              open={isMobile ? sidebarOpen : true}
              onOpen={handleOpen}
              isMobile={isMobile}
            />
            <MainWindow title={windowTitle} />
          </div>
          {generalConfig.general?.aiApiEnabled && <AskAIFloat />}
        </div>
      </PendingRequestContext.Provider>
    </TourContext.Provider>
  );
}

/** Top header bar **/
function Header({ user, onLogout, onHome, isMobile, onToggleSidebar, onOpen, onResetGuide }) {
  const { session } = useContext(AuthContext);
  const { lang, setLang, t } = useContext(LangContext);

  return (
    <header className="sticky-header" style={styles.header(isMobile)}>
      {isMobile && (
        <button
          onClick={onToggleSidebar}
          style={{ ...styles.iconBtn, marginRight: '0.5rem' }}
          className="sm:hidden"
        >
          ☰
        </button>
      )}
      <div style={styles.logoSection}>
        <img
          src="/assets/logo‐small.png"
          alt={t('erp_logo', 'ERP Logo')}
          style={styles.logoImage}
        />
        <span style={styles.logoText}>{t('appName', 'MyERP')}</span>
      </div>
      <nav style={styles.headerNav}>
        <button style={styles.iconBtn} onClick={onHome}>
          🗔 {t("home")}
        </button>
        <button style={styles.iconBtn}>🗗 {t("windows")}</button>
        <button style={styles.iconBtn}>❔ {t("help")}</button>
      </nav>
      <HeaderMenu onOpen={onOpen} />
      {session && (
        <span style={styles.locationInfo}>
          🏢 {session.company_name}
          {session.department_name && ` | 🏬 ${session.department_name}`}
          {session.branch_name && ` | 📍 ${session.branch_name}`}
          {session.user_level_name && ` | 👤 ${session.user_level_name}`}
        </span>
      )}
      <div style={styles.userSection}>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          style={{
            marginRight: '0.5rem',
            color: '#fff',
            backgroundColor: '#1f2937',
            border: '1px solid #fff',
          }}
        >
          <option value="en">en</option>
          <option value="mn">mn</option>
          <option value="ja">ja</option>
          <option value="ko">ko</option>
          <option value="zh">zh</option>
          <option value="es">es</option>
          <option value="de">de</option>
          <option value="fr">fr</option>
          <option value="ru">ru</option>
        </select>
        <UserMenu user={user} onLogout={onLogout} onResetGuide={onResetGuide} />
      </div>
    </header>
  );
}

/** Left sidebar with “menu groups” and “pinned items” **/
function Sidebar({ onOpen, open, isMobile }) {
  const { permissions: perms } = useContext(AuthContext);
  const { t } = useContext(LangContext);
  const location = useLocation();
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));
  const { hasNew } = useContext(PendingRequestContext);

  if (!perms) return null;

  const allMap = {};
  modules.forEach((m) => {
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    allMap[m.module_key] = { ...m, label };
  });

  function isFormsDescendant(mod) {
    let cur = mod;
    while (cur) {
      if (cur.module_key === 'forms') return mod.module_key !== 'forms';
      cur = cur.parent_key ? allMap[cur.parent_key] : null;
    }
    return false;
  }

  const map = {};
  modules.forEach((m) => {
    const formsDesc = isFormsDescendant(m);
    const isTxn = formsDesc && txnModules && txnModules.keys.has(m.module_key);
    if (formsDesc && !isTxn) return;
    if (!m.show_in_sidebar) return;
    if (!isTxn && !perms[m.module_key]) return;
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    map[m.module_key] = { ...m, label, children: [] };
  });

  // Ensure parents exist for permitted modules so children don't become
  // "orphans" when the parent itself is not accessible. This allows modules
  // like the Developer group to appear if any child is shown.
  Object.values(map).forEach((m) => {
    let pKey = m.parent_key;
    while (pKey && !map[pKey] && allMap[pKey]) {
      const parent = allMap[pKey];
      map[pKey] = { ...parent, children: [] };
      pKey = parent.parent_key;
    }
  });

  const roots = [];
  const orphans = [];
  Object.values(map).forEach((m) => {
    if (m.parent_key && map[m.parent_key]) {
      map[m.parent_key].children.push(m);
    } else if (m.parent_key) {
      orphans.push(m);
    } else {
      roots.push(m);
    }
  });

  if (orphans.length > 0) {
    roots.push({
      module_key: '__orphan__',
      label: t('other', 'Other'),
      children: orphans,
    });
  }

  const badgeKeys = new Set();
  if (hasNew && allMap['requests']) {
    let cur = allMap['requests'];
    while (cur) {
      badgeKeys.add(cur.module_key);
      cur = cur.parent_key ? allMap[cur.parent_key] : null;
    }
  }

  return (
    <aside
      id="sidebar"
      className={`sidebar ${open ? 'open' : ''}`}
      style={styles.sidebar(isMobile, open)}
    >
      <nav className="menu-container">
        {roots.map((m) =>
          m.children.length > 0 ? (
            <SidebarGroup
              key={m.module_key}
              mod={m}
              map={map}
              allMap={allMap}
              level={0}
              onOpen={onOpen}
              badgeKeys={badgeKeys}
              generalConfig={generalConfig}
              headerMap={headerMap}
            />
          ) : (
            <button
              key={m.module_key}
              onClick={() =>
                onOpen(
                  modulePath(m, allMap),
                  t(
                    m.module_key,
                    generalConfig.general?.procLabels?.[m.module_key] ||
                      headerMap[m.module_key] ||
                      m.label,
                  ),
                  m.module_key,
                )
              }
              className="menu-item"
              style={styles.menuItem({ isActive: location.pathname === modulePath(m, allMap) })}
            >
              {badgeKeys.has(m.module_key) && <span style={styles.badge} />}
              {t(
                m.module_key,
                generalConfig.general?.procLabels?.[m.module_key] ||
                  headerMap[m.module_key] ||
                  m.label,
              )}
            </button>
          ),
        )}
      </nav>
    </aside>
  );
}

function SidebarGroup({ mod, map, allMap, level, onOpen, badgeKeys, generalConfig, headerMap }) {
  const [open, setOpen] = useState(false);
  const { t } = useContext(LangContext);
  const groupClass =
    level === 0 ? 'menu-group' : level === 1 ? 'menu-group submenu' : 'menu-group subsubmenu';
  return (
    <div className={groupClass} style={{ ...styles.menuGroup, paddingLeft: level ? '1rem' : 0 }}>
      <button className="menu-item" style={styles.groupBtn} onClick={() => setOpen((o) => !o)}>
        {badgeKeys.has(mod.module_key) && <span style={styles.badge} />}
        {t(
          mod.module_key,
          generalConfig.general?.procLabels?.[mod.module_key] ||
            headerMap[mod.module_key] ||
            mod.label,
        )}{' '}
        {open ? '▾' : '▸'}
      </button>
      {open &&
        mod.children.map((c) =>
          c.children.length > 0 ? (
            <SidebarGroup
              key={c.module_key}
              mod={c}
              map={map}
              allMap={allMap}
              level={level + 1}
              onOpen={onOpen}
              badgeKeys={badgeKeys}
              generalConfig={generalConfig}
              headerMap={headerMap}
            />
          ) : (
            <button
              key={c.module_key}
              onClick={() =>
                onOpen(
                  modulePath(c, allMap),
                  t(
                    c.module_key,
                    generalConfig.general?.procLabels?.[c.module_key] ||
                      headerMap[c.module_key] ||
                      c.label,
                  ),
                  c.module_key,
                )
              }
              style={{
                ...styles.menuItem({ isActive: location.pathname === modulePath(c, allMap) }),
                paddingLeft: `${(level + 1) * 1}rem`,
              }}
              className="menu-item"
            >
              {badgeKeys.has(c.module_key) && <span style={styles.badge} />}
              {t(
                c.module_key,
                generalConfig.general?.procLabels?.[c.module_key] ||
                  headerMap[c.module_key] ||
                  c.label,
              )}
            </button>
          ),
        )}
    </div>
  );
}



/** A faux “window” wrapper around the main content **/
function MainWindow({ title }) {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();
  const { tabs, activeKey, switchTab, closeTab, setTabContent, cache } = useTabs();
  const { hasNew } = useContext(PendingRequestContext);
  const {
    startTour,
    getTourForPath,
    registryVersion,
    openTourBuilder,
    openTourViewer,
    ensureTourDefinition,
  } = useContext(TourContext);
  const { userSettings, session } = useContext(AuthContext);
  const { t } = useContext(LangContext);
  const generalConfig = useGeneralConfig();
  const badgePaths = hasNew ? new Set(['/', '/requests']) : new Set();

  const derivedPageKey = useMemo(() => derivePageKey(location.pathname), [location.pathname]);

  // Store rendered outlet by path once the route changes. Avoid tracking
  // the `outlet` object itself to prevent endless updates caused by React
  // creating a new element on every render.
  useEffect(() => {
    setTabContent(location.pathname, outlet);
  }, [location.pathname, setTabContent]);

  useEffect(() => {
    if (!activeKey || activeKey === location.pathname) return;
    if (typeof activeKey !== 'string') return;
    if (!activeKey.startsWith('/')) return;
    navigate(activeKey);
  }, [activeKey, location.pathname, navigate]);

  function handleSwitch(key) {
    switchTab(key);
    if (key.startsWith('/')) navigate(key);
  }

  const elements = { ...cache, [location.pathname]: outlet };
  const tourInfo = useMemo(
    () => getTourForPath(location.pathname),
    [getTourForPath, location.pathname, registryVersion],
  );
  const hasTour = !!(tourInfo?.steps && tourInfo.steps.length);

  const toBooleanFlag = useCallback((value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return Boolean(value);
  }, []);

  const showTourButtonsConfig = toBooleanFlag(
    generalConfig?.general?.showTourButtons,
    true,
  );
  const showTourButtonsPreference = toBooleanFlag(
    userSettings?.showTourButtons,
    true,
  );
  const showTourButtons = showTourButtonsConfig && showTourButtonsPreference;

  useEffect(() => {
    if (!showTourButtons) return undefined;
    if (tourInfo) return undefined;
    if (typeof ensureTourDefinition !== 'function') return undefined;

    const controller = new AbortController();

    ensureTourDefinition({ path: location.pathname, signal: controller.signal }).catch((err) => {
      if (controller.signal.aborted) return;
      console.error('Failed to preload tour definition', err);
    });

    return () => {
      controller.abort();
    };
  }, [ensureTourDefinition, location.pathname, showTourButtons, tourInfo]);

  const configBuilderToggle =
    generalConfig?.general?.tourBuilderEnabled ??
    generalConfig?.general?.enableTourBuilder ??
    generalConfig?.tourBuilder?.enabled ??
    generalConfig?.tours?.builderEnabled;
  const userBuilderToggle =
    userSettings?.settings_enable_tour_builder ??
    userSettings?.settings_enable_tours_builder ??
    userSettings?.settings_enable_tour_management;

  const canManageTours = Boolean(
    session?.permissions?.system_settings &&
      toBooleanFlag(configBuilderToggle, true) &&
      toBooleanFlag(userBuilderToggle, true),
  );

  const handleCreateTour = useCallback(() => {
    if (!canManageTours) return;
    const builderState = {
      mode: 'create',
      pageKey: tourInfo?.pageKey || null,
      path: tourInfo?.path || location.pathname,
    };
    if (!tourInfo?.pageKey) {
      builderState.derivedPageKey = derivedPageKey;
    }
    openTourBuilder?.(builderState);
  }, [canManageTours, derivedPageKey, location.pathname, openTourBuilder, tourInfo]);

  const handleEditTour = useCallback(() => {
    if (!canManageTours || !hasTour || !tourInfo) return;
    openTourBuilder?.({
      mode: 'edit',
      pageKey: tourInfo.pageKey,
      path: tourInfo.path || location.pathname,
      steps: tourInfo.steps,
    });
  }, [canManageTours, hasTour, location.pathname, openTourBuilder, tourInfo]);

  const handleViewTour = useCallback(() => {
    if (!hasTour || !tourInfo) return;
    openTourViewer?.({
      pageKey: tourInfo.pageKey,
      path: tourInfo.path || location.pathname,
      steps: tourInfo.steps,
    });
    startTour(tourInfo.pageKey, tourInfo.steps, {
      force: true,
      path: tourInfo.path || location.pathname,
    });
  }, [hasTour, location.pathname, openTourViewer, startTour, tourInfo]);

  return (
    <div style={styles.windowContainer}>
      <div style={styles.windowHeader}>
        <div style={styles.windowHeaderLeft}>
          <span>{title}</span>
          {showTourButtons && (
            <div style={styles.tourButtonGroup}>
              <button
                type="button"
                onClick={handleCreateTour}
                disabled={!canManageTours}
                style={{
                  ...styles.tourButton,
                  ...(canManageTours ? null : styles.tourButtonDisabled),
                }}
              >
                {t('tour_create', 'Create tour')}
              </button>
              <button
                type="button"
                onClick={handleEditTour}
                disabled={!canManageTours || !hasTour}
                style={{
                  ...styles.tourButton,
                  ...(canManageTours && hasTour ? null : styles.tourButtonDisabled),
                }}
              >
                {t('tour_edit', 'Edit tour')}
              </button>
              <button
                type="button"
                onClick={handleViewTour}
                disabled={!hasTour}
                style={{
                  ...styles.tourButton,
                  ...(hasTour ? null : styles.tourButtonDisabled),
                }}
              >
                {t('tour_view', 'View tour')}
              </button>
            </div>
          )}
        </div>
        <div>
          <button style={styles.windowHeaderBtn}>–</button>
          <button style={styles.windowHeaderBtn}>□</button>
          <button style={styles.windowHeaderBtn}>×</button>
        </div>
      </div>
      <div style={styles.tabBar}>
        {tabs.map((t) => (
          <div
            key={t.key}
            style={activeKey === t.key ? styles.activeTab : styles.tab}
            onClick={() => handleSwitch(t.key)}
          >
            {badgePaths.has(t.key) && <span style={styles.badge} />}
            <span>{t.label}</span>
            {tabs.length > 1 && t.key !== '/' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.key, navigate);
                }}
                style={styles.closeBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={styles.windowContent}>
        {tabs.map((t) => (
          <TabPanel key={t.key} tabKey={t.key} active={t.key === activeKey}>
            <ErrorBoundary>
              {t.key === location.pathname ? elements[t.key] : cache[t.key]}
            </ErrorBoundary>
          </TabPanel>
        ))}
      </div>
    </div>
  );
}

function TabPanel({ tabKey, active, children }) {
  const loading = useIsLoading(tabKey);
  return (
    <div style={{ position: 'relative', display: active ? 'block' : 'none' }}>
      {loading && <Spinner />}
      {children}
    </div>
  );
}

/** Inline styles (you can move these into a `.css` or Tailwind classes if you prefer) **/
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "Arial, sans-serif",
    overflowX: "hidden",
  },
  header: (mobile) => ({
    display: "flex",
    alignItems: "center",
    backgroundColor: "#1f2937",
    color: "#fff",
    padding: "0 1rem",
    height: "48px",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    zIndex: 20,
    marginLeft: mobile ? 0 : "240px",
  }),
  logoSection: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
  },
  logoImage: {
    width: "24px",
    height: "24px",
    marginRight: "0.5rem",
  },
  logoText: {
    fontSize: "1.1rem",
    fontWeight: "bold",
  },
  headerNav: {
    marginLeft: "2rem",
    display: "flex",
    gap: "0.75rem",
    overflowX: "auto",
    whiteSpace: "nowrap",
    flexGrow: 1,
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: "0.25rem 0.5rem",
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
    gap: "0.5rem",
  },
  locationInfo: {
    color: "#e5e7eb",
    fontSize: "0.85rem",
    marginRight: "0.75rem",
  },
  logoutBtn: {
    backgroundColor: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: "3px",
    padding: "0.25rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  body: (mobile) => ({
    display: "flex",
    flexGrow: 1,
    backgroundColor: "#f3f4f6",
    overflow: "auto",
    marginLeft: mobile ? 0 : "240px",
  }),
  sidebar: (mobile, open) => ({
    width: "240px",
    backgroundColor: "#374151",
    color: "#e5e7eb",
    display: "flex",
    flexDirection: "column",
    padding: "1rem 0.5rem",
    flexShrink: 0,
    overflowY: "auto",
    position: "fixed",
    top: "48px",
    left: 0,
    height: "calc(100vh - 48px)",
    zIndex: 30,
    ...(mobile
      ? {
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s",
        }
      : {}),
  }),
  menuGroup: {
    marginBottom: "1rem",
  },
  groupTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    margin: "0.5rem 0 0.25rem 0",
  },
  groupBtn: {
    display: "block",
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#e5e7eb",
    textAlign: "left",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  menuItem: ({ isActive, disabled }) => ({
    display: "block",
    padding: "0.4rem 0.75rem",
    color: disabled ? "#6b7280" : isActive ? "#ffffff" : "#d1d5db",
    backgroundColor: isActive ? "#4b5563" : "transparent",
    textDecoration: "none",
    borderRadius: "3px",
    marginBottom: "0.25rem",
    fontSize: "0.9rem",
    pointerEvents: disabled ? "none" : "auto",
    opacity: disabled ? 0.6 : 1,
  }),
  divider: {
    border: "none",
    borderTop: "1px solid #4b5563",
    margin: "0.5rem 0",
  },
  windowContainer: {
    flexGrow: 1,
    margin: "1rem",
    border: "1px solid #9ca3af",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#ffffff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  windowHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#6b7280",
    color: "#f9fafb",
    padding: "0.5rem 1rem",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    fontSize: "0.95rem",
  },
  windowHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  windowHeaderBtn: {
    marginLeft: "0.5rem",
    background: "transparent",
    border: "none",
    color: "#f9fafb",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #9ca3af",
    backgroundColor: "#e5e7eb",
  },
  tab: {
    padding: "0.25rem 0.5rem",
    marginRight: "2px",
    cursor: "pointer",
    backgroundColor: "#d1d5db",
    display: "flex",
    alignItems: "center",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },
  activeTab: {
    padding: "0.25rem 0.5rem",
    marginRight: "2px",
    cursor: "pointer",
    backgroundColor: "#ffffff",
    border: "1px solid #9ca3af",
    borderBottom: "none",
    display: "flex",
    alignItems: "center",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
  },
  closeBtn: {
    marginLeft: "0.25rem",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  badge: {
    backgroundColor: "red",
    borderRadius: "50%",
    width: "8px",
    height: "8px",
    display: "inline-block",
    marginRight: "4px",
  },
  tourButtonGroup: {
    display: "inline-flex",
    gap: "0.5rem",
  },
  tourButton: {
    backgroundColor: "#4b5563",
    color: "#f9fafb",
    border: "1px solid #9ca3af",
    borderRadius: "4px",
    padding: "0.2rem 0.75rem",
    fontSize: "0.85rem",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
  },
  tourButtonDisabled: {
    backgroundColor: "#6b7280",
    borderColor: "#6b7280",
    color: "#d1d5db",
    cursor: "not-allowed",
    opacity: 0.7,
  },
  windowContent: {
    flexGrow: 1,
    padding: "1rem",
    overflow: "auto",
  },
};
