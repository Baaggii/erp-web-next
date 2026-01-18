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
import useTemporaryNotificationCounts from "../hooks/useTemporaryNotificationCounts.js";
import useBuildUpdateNotice from "../hooks/useBuildUpdateNotice.js";
import { PendingRequestContext } from "../context/PendingRequestContext.jsx";
import { PollingProvider } from "../context/PollingContext.jsx";
import Joyride, { STATUS, ACTIONS, EVENTS } from "react-joyride";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { API_BASE } from "../utils/apiBase.js";
import TourBuilder from "./tours/TourBuilder.jsx";
import TourViewer from "./tours/TourViewer.jsx";
import derivePageKey from "../utils/derivePageKey.js";
import { findVisibleFallbackSelector } from "../utils/findVisibleTourStep.js";
import { playNotificationSound } from "../utils/playNotificationSound.js";
import { buildOptionsForRows } from "../utils/buildAsyncSelectOptions.js";
import NotificationDots from "./NotificationDots.jsx";

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
  isTourGuideMode: true,
  setTourGuideMode: () => {},
  toggleTourGuideMode: () => {},
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

const MISSING_TARGET_ARROW_ATTRIBUTE = "data-tour-missing-target-arrow-marker";
const INTERACTIVE_DESCENDANT_SELECTORS = [
  "button",
  "a[href]",
  "input:not([type=\"hidden\"])",
  "select",
  "textarea",
  "[role=\"button\"]",
  "[role=\"menuitem\"]",
  "[role=\"option\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
];

const REQUEST_STATUS_KEYS = ['pending', 'accepted', 'declined'];
const NOTIFICATION_STATUS_COLORS = {
  declined: '#ef4444',
  pending: '#fbbf24',
  accepted: '#34d399',
};
const NOTIFICATION_STATUS_ORDER = ['declined', 'pending', 'accepted'];

function createEmptyStatusMap() {
  return REQUEST_STATUS_KEYS.reduce((acc, key) => {
    acc[key] = { count: 0, newCount: 0, hasNew: false };
    return acc;
  }, {});
}

function mergeStatusMaps(maps) {
  const result = createEmptyStatusMap();
  REQUEST_STATUS_KEYS.forEach((status) => {
    maps.forEach((map) => {
      if (!map || !map[status]) return;
      const entry = map[status];
      result[status] = {
        count: result[status].count + (Number(entry.count) || 0),
        newCount: result[status].newCount + (Number(entry.newCount) || 0),
        hasNew: result[status].hasNew || Boolean(entry.hasNew),
      };
    });
  });
  return result;
}

function hasAnyNew(incoming, outgoing) {
  return (
    REQUEST_STATUS_KEYS.some((status) => incoming?.[status]?.hasNew) ||
    REQUEST_STATUS_KEYS.some((status) => outgoing?.[status]?.hasNew)
  );
}

function useWorkflowEntry(...rawSources) {
  const sources = useMemo(
    () => rawSources.filter(Boolean),
    rawSources,
  );

  const incoming = useMemo(
    () => mergeStatusMaps(sources.map((src) => src?.incoming)),
    [sources],
  );

  const outgoing = useMemo(
    () => mergeStatusMaps(sources.map((src) => src?.outgoing)),
    [sources],
  );

  const workflowHasNew = useMemo(
    () => hasAnyNew(incoming, outgoing),
    [incoming, outgoing],
  );

  const markSeen = useCallback(() => {
    sources.forEach((src) => {
      if (src && typeof src.markSeen === 'function') {
        src.markSeen();
      }
    });
  }, [sources]);

  const markIncoming = useCallback(
    (statuses) => {
      sources.forEach((src) => {
        if (src && typeof src.markIncoming === 'function') {
          src.markIncoming(statuses);
        }
      });
    },
    [sources],
  );

  const markOutgoing = useCallback(
    (statuses) => {
      sources.forEach((src) => {
        if (src && typeof src.markOutgoing === 'function') {
          src.markOutgoing(statuses);
        }
      });
    },
    [sources],
  );

  return useMemo(
    () => ({
      incoming,
      outgoing,
      hasNew: workflowHasNew,
      markSeen,
      markIncoming,
      markOutgoing,
    }),
    [incoming, outgoing, workflowHasNew, markSeen, markIncoming, markOutgoing],
  );
}

function coerceSelectorValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function coerceSelectorArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.selectors)) {
    return value.selectors;
  }
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || trimmed.includes("\"")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (err) {
      // Ignore JSON parse failures and fall back to delimiter splitting below.
    }
  }

  return trimmed
    .split(/[;,\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSelectorList(selectors, fallback) {
  const list = coerceSelectorArray(selectors)
    .map((value) => coerceSelectorValue(value).trim())
    .filter(Boolean);
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

function getViewportSignature() {
  if (typeof window === "undefined") return "ssr";
  const width = Math.round(
    window.innerWidth || document?.documentElement?.clientWidth || 0,
  );
  const height = Math.round(
    window.innerHeight || document?.documentElement?.clientHeight || 0,
  );
  const ratio =
    typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio.toFixed(2)
      : "1";
  return `${width}x${height}@${ratio}`;
}

function elementIsProbablyFixed(element) {
  if (
    typeof window === "undefined" ||
    !element ||
    typeof element !== "object"
  ) {
    return false;
  }

  const root = element.ownerDocument?.documentElement || document.documentElement;
  let current = element;
  while (current && current !== document.body && current.nodeType === 1) {
    const style =
      typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(current)
        : null;
    const position = style?.position?.toLowerCase() || "";
    if (position === "fixed") {
      return true;
    }

    if (position === "sticky") {
      const rect =
        typeof current.getBoundingClientRect === "function"
          ? current.getBoundingClientRect()
          : null;
      const viewportHeight = window.innerHeight || root?.clientHeight || 0;
      const top = Number.parseFloat(style?.top ?? "");
      const bottom = Number.parseFloat(style?.bottom ?? "");
      const stuckToTop =
        Number.isFinite(top) && rect ? Math.abs(rect.top - top) <= 1 : false;
      const stuckToBottom = Number.isFinite(bottom)
        ? rect && Math.abs(viewportHeight - rect.bottom - bottom) <= 1
        : false;

      if (stuckToTop || stuckToBottom) {
        return true;
      }
    }

    current = current.parentElement;
  }
  return false;
}

function findStepTargetElement(step) {
  if (typeof document === "undefined") return null;
  if (!step || typeof step !== "object") return null;

  const selectors = new Set();
  const addSelector = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    selectors.add(trimmed);
  };

  coerceSelectorArray(step.selectors).forEach(addSelector);
  coerceSelectorArray(step.highlightSelectors).forEach(addSelector);
  addSelector(step.selector);
  addSelector(step.target);

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) return element;
    } catch (err) {
      // Ignore invalid selectors.
    }
  }

  return null;
}

function elementHasVisibleBox(element) {
  if (!element || typeof element !== "object") return false;

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(element);
      if (style) {
        const { display, visibility } = style;
        if (
          display === "none" ||
          visibility === "hidden" ||
          visibility === "collapse"
        ) {
          return false;
        }
      }
    } catch (err) {
      // Ignore style lookup errors and fall back to geometric checks.
    }
  }

  if (typeof element.getBoundingClientRect === "function") {
    try {
      const rect = element.getBoundingClientRect();
      if (rect && typeof rect === "object") {
        const width =
          typeof rect.width === "number"
            ? rect.width
            : typeof rect.right === "number" && typeof rect.left === "number"
              ? rect.right - rect.left
              : 0;
        const height =
          typeof rect.height === "number"
            ? rect.height
            : typeof rect.bottom === "number" && typeof rect.top === "number"
              ? rect.bottom - rect.top
              : 0;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          return true;
        }
      }
    } catch (err) {
      // Ignore getBoundingClientRect errors and fall back to other checks.
    }
  }

  const offsetWidth = typeof element.offsetWidth === "number" ? element.offsetWidth : 0;
  const offsetHeight = typeof element.offsetHeight === "number" ? element.offsetHeight : 0;
  if (offsetWidth > 0 && offsetHeight > 0) {
    return true;
  }

  if (typeof SVGElement !== "undefined" && element instanceof SVGElement) {
    try {
      if (typeof element.getBBox === "function") {
        const box = element.getBBox();
        if (
          box &&
          Number.isFinite(box.width) &&
          Number.isFinite(box.height) &&
          box.width > 0 &&
          box.height > 0
        ) {
          return true;
        }
      }
    } catch (err) {
      // Ignore getBBox errors.
    }
  }

  if ("offsetParent" in element) {
    return Boolean(element.offsetParent);
  }

  return false;
}

function gatherStepSelectors(step) {
  const selectors = new Set();
  const addSelector = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    selectors.add(trimmed);
  };

  coerceSelectorArray(step?.selectors).forEach(addSelector);
  coerceSelectorArray(step?.highlightSelectors).forEach(addSelector);
  addSelector(step?.selector);
  addSelector(step?.target);

  return Array.from(selectors);
}

function isTourStepTargetVisible(step) {
  if (typeof document === "undefined") return true;
  if (!step || typeof step !== "object") return false;

  const checked = new Set();
  const selectors = gatherStepSelectors(step);

  for (const selector of selectors) {
    if (!selector) continue;
    try {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!node || checked.has(node)) continue;
        checked.add(node);
        if (elementHasVisibleBox(node)) {
          return true;
        }
      }
    } catch (err) {
      // Ignore invalid selectors and continue to the next candidate.
    }
  }

  return false;
}

function normalizeClientStep(step, index = 0) {
  if (!step || typeof step !== 'object') return null;
  const selectorRaw =
    typeof step.selector === 'string' && step.selector.trim()
      ? step.selector.trim()
      : typeof step.target === 'string' && step.target.trim()
        ? step.target.trim()
        : '';
  const selectorCandidates = [
    ...coerceSelectorArray(step.selectors),
    ...coerceSelectorArray(step.highlightSelectors),
  ];
  const selectors = normalizeSelectorList(selectorCandidates, selectorRaw);
  const selector = selectors[0] || '';
  const highlightSelectors = normalizeSelectorList(
    coerceSelectorArray(step.highlightSelectors),
    selector || selectorRaw,
  );
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
    target: selector || (highlightSelectors[0] || ''),
    content,
    placement,
    order,
    disableBeacon: true,
  };

  if (title !== undefined && title !== '') normalized.title = title;
  if (offset !== undefined) normalized.offset = offset;
  if (spotlightPadding !== undefined) normalized.spotlightPadding = spotlightPadding;
  if (step.isFixed !== undefined) normalized.isFixed = Boolean(step.isFixed);
  if (step.locale) normalized.locale = step.locale;
  if (step.tooltip) normalized.tooltip = step.tooltip;
  if (step.styles && typeof step.styles === 'object') normalized.styles = step.styles;
  if (step.floaterProps && typeof step.floaterProps === 'object') {
    normalized.floaterProps = step.floaterProps;
  }

  if (highlightSelectors.length) {
    normalized.highlightSelectors = highlightSelectors;
  }

  return normalized;
}

function computeStepSignature(steps) {
  if (!Array.isArray(steps)) return '[]';
  return JSON.stringify(
    steps.map((step) => ({
      id: step.id,
      selector: step.selector,
      selectors: coerceSelectorArray(step.selectors),
      highlightSelectors: coerceSelectorArray(step.highlightSelectors),
      content: step.content,
      placement: step.placement,
      order: step.order,
      title: step.title ?? '',
      offset: step.offset ?? null,
      spotlightPadding: step.spotlightPadding ?? null,
      disableBeacon: step.disableBeacon ?? true,
      isFixed: step.isFixed ?? false,
    })),
  );
}

function sanitizeTourStepsForRestart(steps) {
  if (!Array.isArray(steps)) return [];

  return steps
    .filter(
      (step) => step && typeof step === "object" && !step.missingTargetPauseStep,
    )
    .map((step) => {
      const sanitized = { ...step };

      const originalTarget =
        typeof step.missingTargetOriginalTarget === "string"
          ? step.missingTargetOriginalTarget.trim()
          : "";

      const originalSelectors = coerceSelectorArray(
        step.missingTargetOriginalSelectors,
      )
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);

      const fallbackSelector =
        originalTarget ||
        (typeof step.selector === "string" ? step.selector.trim() : "") ||
        (typeof step.target === "string" ? step.target.trim() : "");

      const normalizedSelectors = normalizeSelectorList(
        originalSelectors.length
          ? originalSelectors
          : coerceSelectorArray(step.selectors)
              .map((value) => (typeof value === "string" ? value.trim() : ""))
              .filter(Boolean),
        fallbackSelector,
      );

      if (normalizedSelectors.length) {
        sanitized.selectors = normalizedSelectors;
        sanitized.highlightSelectors = normalizedSelectors;
        sanitized.selector = normalizedSelectors[0];
      } else if (fallbackSelector) {
        sanitized.selector = fallbackSelector;
        sanitized.selectors = [fallbackSelector];
        sanitized.highlightSelectors = [fallbackSelector];
      } else {
        delete sanitized.selectors;
        delete sanitized.highlightSelectors;
        delete sanitized.selector;
      }

      if (originalTarget) {
        sanitized.target = originalTarget;
      }

      if (
        (!sanitized.target ||
          (typeof sanitized.target === "string" && !sanitized.target.trim())) &&
        typeof sanitized.selector === "string" &&
        sanitized.selector.trim()
      ) {
        sanitized.target = sanitized.selector.trim();
      }

      if (typeof sanitized.target === "string") {
        sanitized.target = sanitized.target.trim();
      }

      if (typeof sanitized.selector === "string") {
        sanitized.selector = sanitized.selector.trim();
      }

      sanitized.disableBeacon = true;

      if ("__runId" in sanitized) {
        delete sanitized.__runId;
      }
      if ("runId" in sanitized) {
        delete sanitized.runId;
      }
      if ("__autoFixed" in sanitized) {
        delete sanitized.__autoFixed;
      }
      if ("__viewportSignature" in sanitized) {
        delete sanitized.__viewportSignature;
      }

      delete sanitized.missingTarget;
      delete sanitized.missingTargetOriginalTarget;
      delete sanitized.missingTargetOriginalSelectors;
      delete sanitized.missingTargetPauseStep;
      delete sanitized.missingTargetPauseStepId;
      delete sanitized.missingTargetPauseForStepId;
      delete sanitized.missingTargetPauseWatchSelectors;
      delete sanitized.missingTargetPauseTooltipMessage;
      delete sanitized.missingTargetPauseHasArrow;
      delete sanitized.missingTargetPauseArrowSelector;
      delete sanitized.missingTargetPauseArrowMessage;
      delete sanitized.missingTargetPauseArrowRect;
      delete sanitized.missingTargetPauseArrowMarker;

      return sanitized;
    });
}

function JoyrideTooltip({
  index = 0,
  size = 0,
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
  const isLastStep = size > 0 && index >= size - 1;

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

  const sanitizedSkipClassName = (skipClassName || '')
    .split(/\s+/)
    .filter((cls) =>
      cls &&
      cls !== 'react-joyride__tooltip-button--skip' &&
      cls !== 'react-joyride__tooltip-button',
    )
    .join(' ');

  const handleBack = (event) => {
    if (typeof backOnClick === 'function') {
      backOnClick(event);
      return;
    }
    if (typeof helpers.goBack === 'function') {
      helpers.goBack(event);
    }
  };

  const handleEnd = (event) => {
    if (typeof skipOnClick === 'function') {
      skipOnClick(event);
      if (event?.defaultPrevented) return;
    }
    if (typeof helpers.close === 'function') {
      helpers.close(true);
    }
  };

  const handlePrimary = (event) => {
    if (isLastStep) {
      if (typeof event?.preventDefault === 'function') {
        event.preventDefault();
      }
      handleEnd(event);
      return;
    }
    if (typeof primaryOnClick === 'function') {
      primaryOnClick(event);
      if (event?.defaultPrevented) return;
      if (typeof helpers.next === 'function') {
        helpers.next(event);
      }
      return;
    }
    if (typeof helpers.next === 'function') {
      helpers.next(event);
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
        {step?.missingTargetPauseStep ? (
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
            {step.missingTargetPauseTooltipMessage
              ? step.missingTargetPauseTooltipMessage
              : step.missingTargetPauseArrowMessage
                ? `${step.missingTargetPauseArrowMessage}.`
                : step.missingTarget
                  ? step.missingTarget
                  : 'Click the highlighted control to continue.'}
          </div>
        ) : step?.missingTarget ? (
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
          onClick={handlePrimary}
          {...restPrimaryProps}
        >
          {nextLabel}
        </button>
        <button
          type="button"
          className={`react-joyride__tooltip-button react-joyride__tooltip-button--end ${sanitizedSkipClassName}`.trim()}
          onClick={handleEnd}
          {...restSkipProps}
        >
          {endLabel}
        </button>
        {isLastStep ? null : (
          <button
            type="button"
            className={`react-joyride__tooltip-button react-joyride__tooltip-button--skip ${skipClassName ?? ''}`.trim()}
            onClick={handleEnd}
            {...restSkipProps}
          >
            {endLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function stripStepForSave(step) {
  if (!step || typeof step !== 'object') return step;
  const {
    target,
    highlightSelectors,
    __runId,
    __autoFixed,
    __viewportSignature,
    ...rest
  } = step;
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
  const { hasUpdateAvailable } = useBuildUpdateNotice();
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
  const tourStepsRef = useRef(tourSteps);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [runTour, setRunTour] = useState(false);
  const tourRunIdRef = useRef(0);
  const activeTourRunIdRef = useRef(0);
  const [activeTourRunId, setActiveTourRunId] = useState(0);
  const [currentTourPage, setCurrentTourPage] = useState('');
  const currentTourPageRef = useRef('');
  const [currentTourPath, setCurrentTourPath] = useState('');
  const currentTourPathRef = useRef('');
  const toursByPageRef = useRef({});
  const toursByPathRef = useRef({});
  const [tourRegistryVersion, setTourRegistryVersion] = useState(0);
  const [tourBuilderState, setTourBuilderState] = useState(null);
  const [tourViewerState, setTourViewerState] = useState(null);
  const [multiSpotlightActive, setMultiSpotlightActive] = useState(false);
  const [isTourGuideMode, setIsTourGuideMode] = useState(true);
  useEffect(() => {
    tourStepsRef.current = tourSteps;
  }, [tourSteps]);

  useEffect(() => {
    currentTourPageRef.current = currentTourPage;
  }, [currentTourPage]);

  useEffect(() => {
    currentTourPathRef.current = currentTourPath;
  }, [currentTourPath]);

  const toggleTourGuideMode = useCallback(() => {
    setIsTourGuideMode((prev) => !prev);
  }, []);

  const updateViewerIndex = useCallback((nextIndex) => {
    setTourViewerState((prev) =>
      prev ? { ...prev, currentStepIndex: nextIndex } : prev,
    );
  }, []);
  const updateTourSteps = useCallback(
    (updater) => {
      if (typeof updater !== "function") return;
      setTourSteps((prevSteps) => {
        const nextSteps = updater(prevSteps);
        if (Array.isArray(nextSteps) && nextSteps !== prevSteps) {
          setTourViewerState((prev) =>
            prev ? { ...prev, steps: nextSteps } : prev,
          );
        }
        return nextSteps;
      });
    },
    [],
  );
  const missingTargetArrowRef = useRef(null);
  const removeMissingTargetArrow = useCallback(() => {
    const entry = missingTargetArrowRef.current;
    if (!entry) return;

    if (
      entry.rafId !== null &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(entry.rafId);
    }
    if (entry.handleScroll) {
      window.removeEventListener("scroll", entry.handleScroll, true);
    }
    if (entry.handleResize) {
      window.removeEventListener("resize", entry.handleResize, true);
    }
    if (entry.resizeObserver) {
      try {
        entry.resizeObserver.disconnect();
      } catch (err) {
        // ignore
      }
    }
    if (
      entry.markerAttribute &&
      entry.markerValue &&
      typeof document !== "undefined" &&
      document?.querySelectorAll
    ) {
      try {
        const selector =
          `[${entry.markerAttribute}="${entry.markerValue}"]`;
        const nodes = document.querySelectorAll(selector);
        nodes.forEach((node) => {
          if (node?.removeAttribute) {
            node.removeAttribute(entry.markerAttribute);
          }
        });
      } catch (err) {
        // ignore selector errors
      }
    }
    if (entry.container?.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
    missingTargetArrowRef.current = null;
  }, []);
  const missingTargetWatcherRef = useRef(null);
  const stopMissingTargetWatcher = useCallback(() => {
    const watcher = missingTargetWatcherRef.current;
    if (!watcher) return;
    if (watcher.observer) {
      try {
        watcher.observer.disconnect();
      } catch (err) {
        // ignore
      }
    }
    if (watcher.intervalId) {
      try {
        clearInterval(watcher.intervalId);
      } catch (err) {
        // ignore
      }
    }
    missingTargetWatcherRef.current = null;
    removeMissingTargetArrow();
  }, [removeMissingTargetArrow]);
  const joyrideScrollOffset = 56;
  const joyrideOverlayColor = multiSpotlightActive
    ? "transparent"
    : "rgba(15, 23, 42, 0.7)";
  const joyrideSpotlightShadow = multiSpotlightActive
    ? "0 0 0 2px rgba(56, 189, 248, 0.85)"
    : "0 0 0 2px rgba(56, 189, 248, 0.55), 0 0 0 9999px rgba(15, 23, 42, 0.65)";
  const extraSpotlightsRef = useRef([]);
  const extraSpotlightContainerRef = useRef(null);
  const resolveMissingTargetById = useCallback(
    (pauseStepId) => {
      if (!pauseStepId) return;
      stopMissingTargetWatcher();
      let placeholderIndex = null;
      let resolvedIndex = null;
      updateTourSteps((prevSteps) => {
        if (!Array.isArray(prevSteps)) return prevSteps;
        const pauseIndex = prevSteps.findIndex((entry) => entry?.id === pauseStepId);
        if (pauseIndex === -1) return prevSteps;
        const pauseStep = prevSteps[pauseIndex];
        if (!pauseStep || typeof pauseStep !== "object") return prevSteps;
        const originalId = pauseStep.missingTargetPauseForStepId;
        if (!originalId) return prevSteps;
        const originalIndex = prevSteps.findIndex((entry) => entry?.id === originalId);
        if (originalIndex === -1) return prevSteps;

        const baseSteps = prevSteps.filter((_, idx) => idx !== pauseIndex);
        const adjustedOriginalIndex =
          originalIndex > pauseIndex ? originalIndex - 1 : originalIndex;
        if (
          adjustedOriginalIndex < 0 ||
          adjustedOriginalIndex >= baseSteps.length
        ) {
          return prevSteps;
        }

        const originalStep = baseSteps[adjustedOriginalIndex];
        if (!originalStep || typeof originalStep !== "object") {
          return prevSteps;
        }

        const restoredStep = { ...originalStep };
        const restoredTarget =
          typeof restoredStep.missingTargetOriginalTarget === "string"
            ? restoredStep.missingTargetOriginalTarget.trim()
            : "";
        if (restoredTarget) {
          restoredStep.target = restoredTarget;
        }

        const restoredSelectorsRaw = Array.isArray(
          restoredStep.missingTargetOriginalSelectors,
        )
          ? restoredStep.missingTargetOriginalSelectors
          : [];
        const restoredSelectors = restoredSelectorsRaw
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean);
        if (restoredSelectors.length) {
          restoredStep.selectors = restoredSelectors;
          restoredStep.selector = restoredSelectors[0];
          restoredStep.highlightSelectors = restoredSelectors;
        }

        delete restoredStep.missingTarget;
        delete restoredStep.missingTargetOriginalTarget;
        delete restoredStep.missingTargetOriginalSelectors;
        delete restoredStep.missingTargetPauseStepId;
        delete restoredStep.missingTargetPauseWatchSelectors;
        delete restoredStep.missingTargetPauseHasArrow;
        delete restoredStep.missingTargetPauseArrowSelector;
        delete restoredStep.missingTargetPauseArrowMessage;
        delete restoredStep.missingTargetPauseArrowRect;
        delete restoredStep.missingTargetPauseArrowMarker;
        delete restoredStep.missingTargetPauseTooltipMessage;

        baseSteps[adjustedOriginalIndex] = restoredStep;
        placeholderIndex = pauseIndex;
        resolvedIndex = adjustedOriginalIndex;
        return baseSteps;
      });

      if (placeholderIndex === null || resolvedIndex === null) {
        return;
      }

      let nextIndexValue = resolvedIndex;
      setTourStepIndex((prevIndex) => {
        if (prevIndex <= placeholderIndex) {
          nextIndexValue = resolvedIndex;
          return resolvedIndex;
        }
        const decremented = Math.max(prevIndex - 1, 0);
        nextIndexValue = decremented;
        return decremented;
      });
      updateViewerIndex(nextIndexValue);
    },
    [stopMissingTargetWatcher, updateTourSteps, updateViewerIndex],
  );

  const startMissingTargetWatcher = useCallback(
    (step) => {
      if (
        !step ||
        typeof step !== "object" ||
        !step.missingTargetPauseStep ||
        !Array.isArray(step.missingTargetPauseWatchSelectors)
      ) {
        return;
      }

      const selectors = step.missingTargetPauseWatchSelectors
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      if (!selectors.length) return;
      if (typeof document === "undefined" || !document?.body) return;

      stopMissingTargetWatcher();

      const checkVisibility = () => {
        for (const selector of selectors) {
          if (!selector) continue;
          try {
            const element = document.querySelector(selector);
            if (element) {
              const hasRect =
                typeof element.getClientRects === "function" &&
                element.getClientRects().length > 0;
              const isSvgElement =
                typeof SVGElement !== "undefined" && element instanceof SVGElement;
              const hasParent =
                (element instanceof HTMLElement && element.offsetParent !== null) ||
                (isSvgElement &&
                  typeof element.getBBox === "function" &&
                  element.getBBox().width > 0 &&
                  element.getBBox().height > 0);
              if (hasRect || hasParent) {
                resolveMissingTargetById(step.id);
                return true;
              }
            }
          } catch (err) {
            // ignore invalid selectors
          }
        }
        return false;
      };

      let observer = null;
      if (typeof MutationObserver === "function") {
        try {
          observer = new MutationObserver(() => {
            checkVisibility();
          });
          observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true,
          });
        } catch (err) {
          observer = null;
        }
      }

      let intervalId = null;
      if (typeof window !== "undefined" && typeof window.setInterval === "function") {
        intervalId = window.setInterval(checkVisibility, 500);
      }

      missingTargetWatcherRef.current = {
        stepId: step.id,
        observer,
        intervalId,
      };

      checkVisibility();
    },
    [resolveMissingTargetById, stopMissingTargetWatcher],
  );

  useEffect(() => () => removeMissingTargetArrow(), [removeMissingTargetArrow]);

  const removeExtraSpotlights = useCallback(() => {
    const entries = Array.isArray(extraSpotlightsRef.current)
      ? extraSpotlightsRef.current
      : [];
    entries.forEach((entry) => {
      const { outline } = entry || {};
      if (outline?.parentNode) {
        outline.parentNode.removeChild(outline);
      }
    });
    extraSpotlightsRef.current = [];

    const container = extraSpotlightContainerRef.current;
    if (container) {
      container.style.maskImage = "";
      container.style.webkitMaskImage = "";
      container.style.maskSize = "";
      container.style.webkitMaskSize = "";
      container.style.maskRepeat = "";
      container.style.webkitMaskRepeat = "";
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
    extraSpotlightContainerRef.current = null;
    setMultiSpotlightActive(false);
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

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const adjustStepsForViewport = useCallback((steps) => {
    if (!Array.isArray(steps) || !steps.length) return steps;
    if (typeof window === "undefined" || typeof document === "undefined") {
      return steps;
    }

    const signature = getViewportSignature();
    let changed = false;

    const adjusted = steps.map((step) => {
      if (!step || typeof step !== "object") return step;

      const element = findStepTargetElement(step);
      const hasElement = !!element;
      const shouldBeFixed = hasElement ? elementIsProbablyFixed(element) : false;
      const hadAutoFixed = step.__autoFixed === true;
      const hasManualFixed = !hadAutoFixed && step.isFixed === true;
      const needsSignatureUpdate = step.__viewportSignature !== signature;

      const shouldApplyAutoFix = hasElement && shouldBeFixed && !hasManualFixed;
      const shouldRemoveAutoFix = hasElement && hadAutoFixed && !shouldBeFixed;
      const maintainAutoFlag = hadAutoFixed && !shouldRemoveAutoFix;

      if (
        !shouldApplyAutoFix &&
        !shouldRemoveAutoFix &&
        !needsSignatureUpdate &&
        !maintainAutoFlag
      ) {
        return step;
      }

      const nextStep = { ...step };
      let mutated = false;

      if (shouldApplyAutoFix) {
        if (!nextStep.isFixed) {
          nextStep.isFixed = true;
          mutated = true;
        }
        if (nextStep.__autoFixed !== true) {
          nextStep.__autoFixed = true;
          mutated = true;
        }
      } else if (shouldRemoveAutoFix) {
        if ("isFixed" in nextStep) {
          delete nextStep.isFixed;
          mutated = true;
        }
        if ("__autoFixed" in nextStep) {
          delete nextStep.__autoFixed;
          mutated = true;
        }
      } else if (maintainAutoFlag && nextStep.__autoFixed !== true) {
        nextStep.__autoFixed = true;
        mutated = true;
      }

      if (needsSignatureUpdate) {
        nextStep.__viewportSignature = signature;
        mutated = true;
      }

      if (mutated) {
        changed = true;
        return nextStep;
      }

      return step;
    });

    return changed ? adjusted : steps;
  }, []);

  const applyViewportAdjustments = useCallback(() => {
    setTourSteps((prev) => {
      if (!Array.isArray(prev) || !prev.length) return prev;
      const adjusted = adjustStepsForViewport(prev);
      if (adjusted === prev) return prev;
      return adjusted;
    });
  }, [adjustStepsForViewport]);

  useEffect(() => {
    if (!runTour) return undefined;
    if (typeof window === "undefined") return undefined;

    let frameId = null;
    const handleResize = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        applyViewportAdjustments();
      });
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [applyViewportAdjustments, runTour]);

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
        const highlightCandidates = coerceSelectorArray(step.highlightSelectors);
        const highlightFallback = highlightCandidates.length
          ? highlightCandidates[0]
          : '';
        step.target = step.selector || highlightFallback || step.target || '';
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

  const restoreCurrentTourDefinition = useCallback(() => {
    const pageKey = currentTourPageRef.current;
    if (!pageKey) return;

    const latestSteps = tourStepsRef.current;
    const sanitizedSteps = sanitizeTourStepsForRestart(latestSteps);
    const storedEntry = toursByPageRef.current[pageKey];
    const pathValue =
      currentTourPathRef.current || storedEntry?.path || undefined;

    if (sanitizedSteps.length) {
      registerTourEntry(pageKey, sanitizedSteps, pathValue);
      return;
    }

    if (storedEntry) {
      registerTourEntry(storedEntry.pageKey, storedEntry.steps, storedEntry.path);
    }
  }, [registerTourEntry]);

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

        const responsiveSteps = adjustStepsForViewport(runnableSteps);
        const joyrideSteps = responsiveSteps.map((step) => ({
          ...step,
          target: step.target || step.selector || step.id,
          __runId: nextRunId,
        }));
        removeExtraSpotlights();
        setTourStepIndex(initialStepIndex);
        setTourSteps(joyrideSteps);
        setCurrentTourPage(pageKey);
        setCurrentTourPath(entry?.path || normalizePath(targetPath));
        setIsTourGuideMode(true);
        setRunTour(true);
        return true;
      }

      return false;
    },
    [
      adjustStepsForViewport,
      location.pathname,
      normalizePath,
      registerTourEntry,
      removeExtraSpotlights,
      updateUserSettings,
      userSettings,
    ],
  );

  const endTour = useCallback(() => {
    restoreCurrentTourDefinition();
    removeExtraSpotlights();
    stopMissingTargetWatcher();
    setIsTourGuideMode(true);
    setRunTour(false);
    setTourSteps([]);
    setTourStepIndex(0);
    setCurrentTourPage("");
    setCurrentTourPath("");
    closeTourViewer();
  }, [
    closeTourViewer,
    removeExtraSpotlights,
    restoreCurrentTourDefinition,
    stopMissingTargetWatcher,
  ]);

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
        // Skip the global loader so a slow or unreachable tours endpoint
        // does not dim the active tab on startup.
        skipLoader: true,
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
    map['/notifications'] = t('notifications', 'Notifications');
    return map;
  }, [moduleMap, t]);
  const validPaths = useMemo(() => {
    const paths = new Set(["/"]);
    modules.forEach((m) => {
      paths.add(modulePath(m, moduleMap));
    });
    paths.add('/notifications');
    return paths;
  }, [modules, moduleMap]);
  const toastApi = useToast();
  const addToast = useCallback(
    (message, type) => {
      if (toastApi && typeof toastApi.addToast === "function") {
        toastApi.addToast(message, type);
        return;
      }
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        const typeLabel = type ? `[${type}] ` : "";
        console.warn(`${typeLabel}${message}`);
      }
    },
    [toastApi],
  );

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

          if (type === EVENTS.STEP_BEFORE || type === EVENTS.TOOLTIP_OPEN) {
            const clampedIndex = clampIndex(index);
            setTourStepIndex(clampedIndex);
            if (isCurrentRun) {
              updateViewerIndex(clampedIndex);
              if (type === EVENTS.TOOLTIP_OPEN) {
                if (step?.missingTargetPauseStep) {
                  startMissingTargetWatcher(step);
                } else if (missingTargetWatcherRef.current?.stepId) {
                  stopMissingTargetWatcher();
                }
                updateTourSteps((prevSteps) => {
                  if (!Array.isArray(prevSteps)) return prevSteps;
                  if (clampedIndex < 0 || clampedIndex >= prevSteps.length) {
                    return prevSteps;
                  }
                  const targetStep = prevSteps[clampedIndex];
                  if (!targetStep || typeof targetStep !== "object") {
                    return prevSteps;
                  }
                  if (targetStep.missingTargetPauseStep) {
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
                        missingTargetOriginalSelectors,
                        ...restStep
                      } = targetStep;
                      const restoredStep = { ...restStep };
                      restoredStep.disableBeacon = true;
                      if (missingTargetOriginalSelectors) {
                        restoredStep.selectors = missingTargetOriginalSelectors;
                        restoredStep.selector = missingTargetOriginalSelectors[0];
                        restoredStep.highlightSelectors = missingTargetOriginalSelectors;
                      }
                      restoredStep.target = storedOriginal;
                      nextSteps[clampedIndex] = restoredStep;
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
            if (missingTargetWatcherRef.current?.stepId === step?.id) {
              stopMissingTargetWatcher();
            }
            const delta = action === ACTIONS.PREV ? -1 : 1;
            const currentClampedIndex = clampIndex(index);
            const nextIndex = clampIndex(index + delta);
            if (delta > 0 && nextIndex !== currentClampedIndex) {
              const nextStep = tourSteps[nextIndex];
              if (
                nextStep &&
                !nextStep.missingTargetPauseStep &&
                !isTourStepTargetVisible(nextStep)
              ) {
                const message = t(
                  "tour_next_step_hidden",
                  "Reveal the next control before continuing the tour.",
                );
                addToast(message, "warning");
              }
            }
            setTourStepIndex(nextIndex);
            updateViewerIndex(nextIndex);
          } else if (type === EVENTS.TARGET_NOT_FOUND && isCurrentRun) {
            stopMissingTargetWatcher();
            const clampedIndex = clampIndex(index);
            const fallbackMessage = t(
              "tour_missing_target_hint",
              "Expand the referenced control to continue the tour.",
            );
            let placeholderStep = null;
            let placeholderIndex = clampedIndex;
            updateTourSteps((prevSteps) => {
              if (!Array.isArray(prevSteps)) return prevSteps;
              if (clampedIndex < 0 || clampedIndex >= prevSteps.length) {
                return prevSteps;
              }

              const currentStep = prevSteps[clampedIndex];
              if (!currentStep || typeof currentStep !== "object") {
                return prevSteps;
              }
              if (currentStep.missingTargetPauseStep) {
                return prevSteps;
              }

              const fallbackSelectorInfo = findVisibleFallbackSelector(currentStep);
              const fallbackSelectorCandidates = Array.isArray(
                fallbackSelectorInfo?.highlightSelectors,
              )
                ? fallbackSelectorInfo.highlightSelectors
                    .map((value) => (typeof value === "string" ? value.trim() : ""))
                    .filter(Boolean)
                : [];
              const fallbackSelectorPrimaryCandidate = fallbackSelectorCandidates[0];
              const fallbackSelector = fallbackSelectorPrimaryCandidate
                ? fallbackSelectorPrimaryCandidate
                : typeof fallbackSelectorInfo === "string"
                  ? fallbackSelectorInfo.trim()
                  : typeof fallbackSelectorInfo?.selector === "string"
                    ? fallbackSelectorInfo.selector.trim()
                    : "";
              const fallbackHighlightSelectors = fallbackSelectorCandidates.length
                ? fallbackSelectorCandidates
                : fallbackSelector
                  ? [fallbackSelector]
                  : [];
              if (!fallbackSelector) {
                return prevSteps;
              }

              const arrowMessage = t(
                "tour_missing_target_arrow_hint",
                "Press here to reveal the next control",
              );
              const tooltipMessage = t(
                "tour_missing_target_tooltip_hint",
                "Click the highlighted parent control to continue.",
              );

              const trimmedTarget =
                typeof currentStep.target === "string"
                  ? currentStep.target.trim()
                  : "";
              const trimmedSelector =
                typeof currentStep.selector === "string"
                  ? currentStep.selector.trim()
                  : "";
              const existingOriginalTarget =
                typeof currentStep.missingTargetOriginalTarget === "string"
                  ? currentStep.missingTargetOriginalTarget.trim()
                  : "";

              const combinedSelectorsSet = new Set();
              const selectorsFromStep = coerceSelectorArray(currentStep.selectors)
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean);
              selectorsFromStep.forEach((value) => combinedSelectorsSet.add(value));
              const highlightSelectors = coerceSelectorArray(
                currentStep.highlightSelectors,
              )
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean);
              highlightSelectors.forEach((value) => combinedSelectorsSet.add(value));
              if (trimmedTarget && trimmedTarget !== fallbackSelector) {
                combinedSelectorsSet.add(trimmedTarget);
              }
              if (trimmedSelector && trimmedSelector !== fallbackSelector) {
                combinedSelectorsSet.add(trimmedSelector);
              }
              const normalizedOriginalSelectors = Array.from(combinedSelectorsSet);

              const fallbackHighlightSet = new Set(fallbackHighlightSelectors);
              const fallbackWatchSelectors = [trimmedTarget, trimmedSelector]
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter((value, idx, arr) => {
                  if (!value) return false;
                  if (fallbackHighlightSet.has(value)) return false;
                  return arr.indexOf(value) === idx;
                });

              const watchSelectors = normalizedOriginalSelectors.length
                ? normalizedOriginalSelectors
                : fallbackWatchSelectors;

              let arrowRect = null;
              let arrowIsValid = false;
              let arrowTrackedElement = null;
              let markerValueForAssignment = "";
              let markerValueForRemoval = "";
              if (typeof document !== "undefined" && document?.body) {
                try {
                  const arrowElements = document.querySelectorAll(fallbackSelector);
                  if (arrowElements.length > 0) {
                    const candidateElements = [];
                    Array.from(arrowElements).forEach((element, elementIndex) => {
                      if (!element || typeof element.getBoundingClientRect !== "function") {
                        return;
                      }

                      const seenNodes = new Set();
                      const pushCandidate = (rect, resolvedElement, visible) => {
                        if (!rect) return;
                        candidateElements.push({
                          element,
                          rect,
                          visible: Boolean(visible),
                          elementIndex,
                          resolvedElement: resolvedElement || element,
                        });
                      };

                      const baseRect = element.getBoundingClientRect();
                      if (baseRect) {
                        const baseVisible = baseRect.width > 0 && baseRect.height > 0;
                        pushCandidate(baseRect, element, baseVisible);
                        seenNodes.add(element);
                      }

                      for (const selector of INTERACTIVE_DESCENDANT_SELECTORS) {
                        let nodes = [];
                        try {
                          nodes = Array.from(element.querySelectorAll(selector));
                        } catch (err) {
                          // ignore invalid selectors
                        }
                        nodes.forEach((node) => {
                          if (!node || seenNodes.has(node)) return;
                          seenNodes.add(node);
                          if (typeof node.getBoundingClientRect !== "function") return;
                          const nodeRect = node.getBoundingClientRect();
                          if (!nodeRect) return;
                          const nodeVisible = nodeRect.width > 0 && nodeRect.height > 0;
                          pushCandidate(nodeRect, node, nodeVisible);
                        });
                      }
                    });

                    if (candidateElements.length) {
                      const targetSelectorCandidates = [];
                      const seenTargets = new Set();
                      const pushTargetSelector = (value) => {
                        if (typeof value !== "string") return;
                        const trimmed = value.trim();
                        if (!trimmed || trimmed === fallbackSelector) return;
                        if (seenTargets.has(trimmed)) return;
                        seenTargets.add(trimmed);
                        targetSelectorCandidates.push(trimmed);
                      };

                      if (normalizedOriginalSelectors.length) {
                        normalizedOriginalSelectors.forEach((value) => pushTargetSelector(value));
                      } else {
                        pushTargetSelector(trimmedTarget);
                        pushTargetSelector(trimmedSelector);
                        coerceSelectorArray(currentStep.selectors).forEach((value) =>
                          pushTargetSelector(value),
                        );
                        coerceSelectorArray(currentStep.highlightSelectors).forEach(
                          (value) => pushTargetSelector(value),
                        );
                      }

                      const targetRects = [];
                      targetSelectorCandidates.forEach((selectorValue) => {
                        try {
                          const nodes = document.querySelectorAll(selectorValue);
                          Array.from(nodes).forEach((node) => {
                            if (!node || typeof node.getBoundingClientRect !== "function") {
                              return;
                            }
                            const rect = node.getBoundingClientRect();
                            if (rect) {
                              targetRects.push({ rect });
                            }
                          });
                        } catch (err) {
                          // ignore invalid selectors
                        }
                      });

                      const candidateWithScore = candidateElements.map((candidate) => {
                        const { rect, visible, elementIndex } = candidate;
                        const candidateCenterX = rect.left + rect.width / 2;
                        const candidateCenterY = rect.top + rect.height / 2;

                        let nearestDistance = Infinity;
                        if (targetRects.length) {
                          targetRects.forEach(({ rect: targetRect }) => {
                            if (!targetRect) return;
                            const targetCenterX = targetRect.left + targetRect.width / 2;
                            const targetCenterY = targetRect.top + targetRect.height / 2;
                            const dx = candidateCenterX - targetCenterX;
                            const dy = candidateCenterY - targetCenterY;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance < nearestDistance) {
                              nearestDistance = distance;
                            }
                          });
                        } else {
                          nearestDistance = elementIndex;
                        }

                        const visibilityScore = visible ? 0 : 1;
                        return {
                          candidate,
                          visibilityScore,
                          nearestDistance,
                          elementIndex,
                        };
                      });

                      candidateWithScore.sort((a, b) => {
                        if (a.visibilityScore !== b.visibilityScore) {
                          return a.visibilityScore - b.visibilityScore;
                        }
                        if (a.nearestDistance !== b.nearestDistance) {
                          return a.nearestDistance - b.nearestDistance;
                        }
                        return a.elementIndex - b.elementIndex;
                      });

                      const bestCandidate = candidateWithScore[0]?.candidate;
                      if (bestCandidate?.visible && bestCandidate.rect) {
                        const { rect } = bestCandidate;
                        arrowRect = {
                          top: rect.top,
                          left: rect.left,
                          width: rect.width,
                          height: rect.height,
                        };
                        arrowIsValid = true;
                        arrowTrackedElement =
                          bestCandidate.resolvedElement || bestCandidate.element;
                      }
                    }
                  }
                } catch (err) {
                  // ignore invalid selectors
                }
              }

              const placeholderContent =
                currentStep.content !== undefined && currentStep.content !== null
                  ? currentStep.content
                  : fallbackMessage;

              const existingPauseId =
                typeof currentStep.missingTargetPauseStepId === "string"
                  ? currentStep.missingTargetPauseStepId.trim()
                  : "";

              const existingMissing =
                typeof currentStep.missingTarget === "string"
                  ? currentStep.missingTarget.trim()
                  : "";
              const combinedMessage = existingMissing.length
                ? existingMissing.includes(fallbackMessage)
                  ? existingMissing
                  : `${existingMissing}\n${fallbackMessage}`
                : fallbackMessage;

              const ensureOriginalTarget = () => {
                if (existingOriginalTarget) return existingOriginalTarget;
                if (trimmedTarget && trimmedTarget !== fallbackSelector) {
                  return trimmedTarget;
                }
                if (trimmedSelector && trimmedSelector !== fallbackSelector) {
                  return trimmedSelector;
                }
                if (normalizedOriginalSelectors.length) {
                  return normalizedOriginalSelectors[0];
                }
                return trimmedTarget || trimmedSelector || currentStep.target || "";
              };

              if (existingPauseId) {
                const pauseIndex = prevSteps.findIndex(
                  (entry) => entry?.id === existingPauseId,
                );
                if (pauseIndex >= 0) {
                  const pauseStep = prevSteps[pauseIndex];
                  if (pauseStep && typeof pauseStep === "object") {
                    const updatedPauseStep = { ...pauseStep };
                    let mutated = false;
                    if (updatedPauseStep.content !== placeholderContent) {
                      updatedPauseStep.content = placeholderContent;
                      mutated = true;
                    }
                    if (updatedPauseStep.missingTarget !== combinedMessage) {
                      updatedPauseStep.missingTarget = combinedMessage;
                      mutated = true;
                    }
                    if (
                      updatedPauseStep.missingTargetPauseForStepId !== currentStep.id
                    ) {
                      updatedPauseStep.missingTargetPauseForStepId = currentStep.id;
                      mutated = true;
                    }
                    const pauseWatch = Array.isArray(
                      updatedPauseStep.missingTargetPauseWatchSelectors,
                    )
                      ? updatedPauseStep.missingTargetPauseWatchSelectors
                      : [];
                    const normalizedWatch = watchSelectors;
                    if (
                      normalizedWatch.length &&
                      (pauseWatch.length !== normalizedWatch.length ||
                        normalizedWatch.some((value, idx) => value !== pauseWatch[idx]))
                    ) {
                      updatedPauseStep.missingTargetPauseWatchSelectors = normalizedWatch;
                      mutated = true;
                    }
                    const normalizedPauseSelectors = coerceSelectorArray(
                      updatedPauseStep.selectors,
                    )
                      .map((value) =>
                        typeof value === "string" ? value.trim() : "",
                      )
                      .filter(Boolean);
                    const normalizedPauseHighlights = coerceSelectorArray(
                      updatedPauseStep.highlightSelectors,
                    )
                      .map((value) =>
                        typeof value === "string" ? value.trim() : "",
                      )
                      .filter(Boolean);
                    const selectorsChanged =
                      normalizedPauseSelectors.length !==
                        fallbackHighlightSelectors.length ||
                      normalizedPauseSelectors.some(
                        (value, idx) => value !== fallbackHighlightSelectors[idx],
                      );
                    const highlightChanged =
                      normalizedPauseHighlights.length !==
                        fallbackHighlightSelectors.length ||
                      normalizedPauseHighlights.some(
                        (value, idx) => value !== fallbackHighlightSelectors[idx],
                      );
                    if (
                      updatedPauseStep.target !== fallbackSelector ||
                      updatedPauseStep.selector !== fallbackSelector ||
                      selectorsChanged ||
                      highlightChanged
                    ) {
                      updatedPauseStep.target = fallbackSelector;
                      updatedPauseStep.selector = fallbackSelector;
                      updatedPauseStep.selectors = [...fallbackHighlightSelectors];
                      updatedPauseStep.highlightSelectors = [...fallbackHighlightSelectors];
                      mutated = true;
                    }
                    const previousMarkerValue =
                      typeof updatedPauseStep.missingTargetPauseArrowMarker === "string"
                        ? updatedPauseStep.missingTargetPauseArrowMarker.trim()
                        : "";
                    if (arrowIsValid) {
                      const markerValue =
                        previousMarkerValue || createClientStepId();
                      const markerSelector =
                        `[${MISSING_TARGET_ARROW_ATTRIBUTE}="${markerValue}"]`;

                      if (
                        updatedPauseStep.missingTargetPauseHasArrow !== true
                      ) {
                        updatedPauseStep.missingTargetPauseHasArrow = true;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowSelector !==
                        markerSelector
                      ) {
                        updatedPauseStep.missingTargetPauseArrowSelector =
                          markerSelector;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowMarker !==
                        markerValue
                      ) {
                        updatedPauseStep.missingTargetPauseArrowMarker = markerValue;
                        mutated = true;
                      }
                      if (arrowRect) {
                        const prevRect =
                          updatedPauseStep.missingTargetPauseArrowRect;
                        const rectChanged =
                          !prevRect ||
                          prevRect.top !== arrowRect.top ||
                          prevRect.left !== arrowRect.left ||
                          prevRect.width !== arrowRect.width ||
                          prevRect.height !== arrowRect.height;
                        if (rectChanged) {
                          updatedPauseStep.missingTargetPauseArrowRect = arrowRect;
                          mutated = true;
                        }
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowMessage !==
                        arrowMessage
                      ) {
                        updatedPauseStep.missingTargetPauseArrowMessage = arrowMessage;
                        mutated = true;
                      }
                      markerValueForAssignment = markerValue;
                      if (
                        previousMarkerValue &&
                        previousMarkerValue !== markerValue &&
                        !markerValueForRemoval
                      ) {
                        markerValueForRemoval = previousMarkerValue;
                      }
                    } else {
                      if (
                        updatedPauseStep.missingTargetPauseHasArrow !== undefined
                      ) {
                        delete updatedPauseStep.missingTargetPauseHasArrow;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowSelector !==
                        undefined
                      ) {
                        delete updatedPauseStep.missingTargetPauseArrowSelector;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowRect !== undefined
                      ) {
                        delete updatedPauseStep.missingTargetPauseArrowRect;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowMessage !== undefined
                      ) {
                        delete updatedPauseStep.missingTargetPauseArrowMessage;
                        mutated = true;
                      }
                      if (
                        updatedPauseStep.missingTargetPauseArrowMarker !== undefined
                      ) {
                        delete updatedPauseStep.missingTargetPauseArrowMarker;
                        mutated = true;
                      }
                      if (!markerValueForRemoval && previousMarkerValue) {
                        markerValueForRemoval = previousMarkerValue;
                      }
                    }
                    if (
                      updatedPauseStep.missingTargetPauseTooltipMessage !==
                      tooltipMessage
                    ) {
                      updatedPauseStep.missingTargetPauseTooltipMessage =
                        tooltipMessage;
                      mutated = true;
                    }
                    if (mutated) {
                      const nextSteps = [...prevSteps];
                      nextSteps[pauseIndex] = updatedPauseStep;
                      placeholderStep = updatedPauseStep;
                      placeholderIndex = pauseIndex;
                      return nextSteps;
                    }
                    placeholderStep = updatedPauseStep;
                    placeholderIndex = pauseIndex;
                    return prevSteps;
                  }
                }
              }

              const pauseStepId = existingPauseId || createClientStepId();
              const originalTarget = ensureOriginalTarget();
              const updatedCurrentStep = {
                ...currentStep,
                target: originalTarget || currentStep.target,
                selector: originalTarget || currentStep.selector,
                missingTargetOriginalTarget: originalTarget || "",
                missingTargetOriginalSelectors: normalizedOriginalSelectors,
                missingTargetPauseStepId: pauseStepId,
              };
              updatedCurrentStep.disableBeacon = true;
              if (normalizedOriginalSelectors.length) {
                updatedCurrentStep.selectors = normalizedOriginalSelectors;
                updatedCurrentStep.highlightSelectors = normalizedOriginalSelectors;
              }
              delete updatedCurrentStep.missingTarget;
              delete updatedCurrentStep.missingTargetPauseArrowMarker;

              const placeholder = {
                ...currentStep,
                id: pauseStepId,
                target: fallbackSelector,
                selector: fallbackSelector,
                selectors: [...fallbackHighlightSelectors],
                highlightSelectors: [...fallbackHighlightSelectors],
                content: placeholderContent,
                missingTarget: combinedMessage,
                missingTargetPauseStep: true,
                missingTargetPauseForStepId: currentStep.id,
                missingTargetPauseWatchSelectors: watchSelectors,
                missingTargetPauseTooltipMessage: tooltipMessage,
              };
              placeholder.disableBeacon = true;
              delete placeholder.missingTargetPauseHasArrow;
              delete placeholder.missingTargetPauseArrowSelector;
              delete placeholder.missingTargetPauseArrowMessage;
              delete placeholder.missingTargetPauseArrowRect;
              delete placeholder.missingTargetPauseArrowMarker;
              if (arrowIsValid) {
                const markerValue =
                  markerValueForAssignment || createClientStepId();
                const markerSelector =
                  `[${MISSING_TARGET_ARROW_ATTRIBUTE}="${markerValue}"]`;
                markerValueForAssignment = markerValue;
                placeholder.missingTargetPauseHasArrow = true;
                placeholder.missingTargetPauseArrowSelector = markerSelector;
                placeholder.missingTargetPauseArrowMessage = arrowMessage;
                placeholder.missingTargetPauseArrowMarker = markerValue;
                if (arrowRect) {
                  placeholder.missingTargetPauseArrowRect = arrowRect;
                }
              }
              delete placeholder.missingTargetOriginalTarget;
              delete placeholder.missingTargetOriginalSelectors;
              delete placeholder.missingTargetPauseStepId;

              const nextSteps = [...prevSteps];
              nextSteps.splice(clampedIndex, 0, placeholder);
              nextSteps[clampedIndex + 1] = updatedCurrentStep;
              placeholderStep = placeholder;
              placeholderIndex = clampedIndex;
              return nextSteps;
            });

            if (
              markerValueForRemoval &&
              typeof document !== "undefined" &&
              document?.querySelectorAll
            ) {
              try {
                const selector =
                  `[${MISSING_TARGET_ARROW_ATTRIBUTE}="${markerValueForRemoval}"]`;
                const nodes = document.querySelectorAll(selector);
                nodes.forEach((node) => {
                  if (node?.removeAttribute) {
                    node.removeAttribute(MISSING_TARGET_ARROW_ATTRIBUTE);
                  }
                });
              } catch (err) {
                // ignore selector errors
              }
            }

            if (
              arrowIsValid &&
              markerValueForAssignment &&
              arrowTrackedElement &&
              typeof document !== "undefined"
            ) {
              try {
                const selector =
                  `[${MISSING_TARGET_ARROW_ATTRIBUTE}="${markerValueForAssignment}"]`;
                const nodes = document.querySelectorAll(selector);
                nodes.forEach((node) => {
                  if (node === arrowTrackedElement) return;
                  if (node?.removeAttribute) {
                    node.removeAttribute(MISSING_TARGET_ARROW_ATTRIBUTE);
                  }
                });
                if (arrowTrackedElement.setAttribute) {
                  arrowTrackedElement.setAttribute(
                    MISSING_TARGET_ARROW_ATTRIBUTE,
                    markerValueForAssignment,
                  );
                }
              } catch (err) {
                // ignore selector errors
              }
            }

            if (placeholderStep && Number.isFinite(placeholderIndex)) {
              setTourStepIndex(placeholderIndex);
              updateViewerIndex(placeholderIndex);
              startMissingTargetWatcher(placeholderStep);
            }
          }
        }

        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
          stopMissingTargetWatcher();
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
      startMissingTargetWatcher,
      stopMissingTargetWatcher,
      t,
      tourSteps,
      updateTourSteps,
      updateUserSettings,
      updateViewerIndex,
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
    const selectors = [];
    const seenSelectors = new Set();
    const pushSelector = (value) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed || seenSelectors.has(trimmed)) return;
      seenSelectors.add(trimmed);
      selectors.push(trimmed);
    };

    const primarySelectorRaw =
      typeof step.target === "string" && step.target.trim()
        ? step.target.trim()
        : typeof step.selector === "string" && step.selector.trim()
          ? step.selector.trim()
          : "";

    pushSelector(primarySelectorRaw);

    coerceSelectorArray(step.highlightSelectors).forEach((value) =>
      pushSelector(value),
    );
    coerceSelectorArray(step.selectors).forEach((value) => pushSelector(value));

    const trimmedSelectors = selectors.filter(Boolean);
    const primaryElement =
      typeof step.target !== "string" &&
      step.target &&
      typeof step.target.getBoundingClientRect === "function"
        ? step.target
        : null;

    if (!trimmedSelectors.length && !primaryElement) {
      return undefined;
    }

    const paddingValue = Number(step.spotlightPadding);
    const padding = Number.isFinite(paddingValue) ? paddingValue : 10;
    const seenMaskElements = new Set();
    const primaryElements = new Set();
    const seenOutlineElements = new Set();
    const resolvedSelectors = new Set();
    let sawMissingSelector = false;
    const maskTargets = [];
    const outlineTargets = [];
    let hasVisibleSecondaryTarget = false;

    if (primaryElement) {
      seenMaskElements.add(primaryElement);
      primaryElements.add(primaryElement);
      maskTargets.push({ element: primaryElement, padding });
    }

    const declaredTargetCount = (primaryElement ? 1 : 0) + trimmedSelectors.length;
    const hasMultipleDeclaredTargets = declaredTargetCount > 1;

    trimmedSelectors.forEach((selector, index) => {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch (err) {
        console.warn("Invalid selector for tour spotlight", selector, err);
        sawMissingSelector = true;
        return;
      }
      if (!elements.length) {
        sawMissingSelector = true;
        return;
      }
      const isPrimarySelector = index === 0;
      let hasVisibleElementForSelector = false;
      elements.forEach((element) => {
        if (!element || typeof element.getBoundingClientRect !== "function") {
          return;
        }
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return;
        }
        hasVisibleElementForSelector = true;
        if (!seenMaskElements.has(element)) {
          seenMaskElements.add(element);
          maskTargets.push({ element, padding });
        }
        if (isPrimarySelector) {
          primaryElements.add(element);
        } else if (!primaryElements.has(element) && !seenOutlineElements.has(element)) {
          seenOutlineElements.add(element);
          outlineTargets.push({ element, padding });
          hasVisibleSecondaryTarget = true;
        }
      });
      if (!hasVisibleElementForSelector) {
        sawMissingSelector = true;
        return;
      }
      resolvedSelectors.add(selector);
    });

    const hasMissingSelectors =
      hasMultipleDeclaredTargets &&
      (sawMissingSelector || resolvedSelectors.size < trimmedSelectors.length);

    if (!hasMultipleDeclaredTargets && maskTargets.length <= 1) {
      return undefined;
    }

    if (hasMultipleDeclaredTargets && !hasVisibleSecondaryTarget) {
      return undefined;
    }

    const overlay = document.createElement("div");
    overlay.className = "tour-extra-spotlight-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: 10001,
      backgroundColor: "transparent",
      isolation: "isolate",
    });
    document.body.appendChild(overlay);
    extraSpotlightContainerRef.current = overlay;

    const createOutlineEntry = (element, paddingAmount, role = "outline") => {
      const outline = document.createElement("div");
      outline.className = "tour-extra-spotlight";
      Object.assign(outline.style, {
        position: "absolute",
        borderRadius: "12px",
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        boxShadow:
          "0 0 0 2px rgba(59, 130, 246, 0.85), 0 12px 24px rgba(15, 23, 42, 0.35), 0 0 35px rgba(59, 130, 246, 0.55)",
        pointerEvents: "none",
        transition: "all 0.15s ease",
        opacity: role === "mask" ? "0" : "1",
      });
      outline.dataset.spotlightRole = role;
      overlay.appendChild(outline);
      return { outline, element, padding: paddingAmount, role };
    };

    const maskSpotlightEntries = maskTargets.map(({ element, padding: paddingAmount }) =>
      createOutlineEntry(element, paddingAmount, "mask"),
    );

    const outlineSpotlightEntries = outlineTargets.map(({ element, padding: paddingAmount }) =>
      createOutlineEntry(element, paddingAmount, "outline"),
    );

    const spotlightEntries = [...maskSpotlightEntries, ...outlineSpotlightEntries];

    extraSpotlightsRef.current = spotlightEntries;
    setMultiSpotlightActive(true);

    const updateOverlay = () => {
      const overlayElement = extraSpotlightContainerRef.current;
      if (!overlayElement) return;
      const viewportWidth = Math.max(
        window.innerWidth || 0,
        document.documentElement?.clientWidth || 0,
        document.body?.clientWidth || 0,
      );
      const viewportHeight = Math.max(
        window.innerHeight || 0,
        document.documentElement?.clientHeight || 0,
        document.body?.clientHeight || 0,
      );

      const maskId = "tour-spotlight-mask";
      const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}" viewBox="0 0 ${viewportWidth} ${viewportHeight}" preserveAspectRatio="none">`,
        `<defs>`,
        `<mask id="${maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" mask-type="alpha">`,
        `<rect x="0" y="0" width="${viewportWidth}" height="${viewportHeight}" fill="white" />`,
      ];
      let hasVisibleRect = false;

      maskTargets.forEach(({ element, padding: paddingAmount }) => {
        const rect = element.getBoundingClientRect();
        const expandedWidth = rect.width + paddingAmount * 2;
        const expandedHeight = rect.height + paddingAmount * 2;
        if (expandedWidth <= 0 || expandedHeight <= 0) {
          return;
        }
        const expandedLeft = rect.left - paddingAmount;
        const expandedTop = rect.top - paddingAmount;
        const x = Math.floor(expandedLeft);
        const y = Math.floor(expandedTop);
        const widthValue = Math.max(0, Math.ceil(expandedWidth));
        const heightValue = Math.max(0, Math.ceil(expandedHeight));
        svgParts.push(
          `<rect x="${x}" y="${y}" width="${widthValue}" height="${heightValue}" rx="12" ry="12" fill="white" fill-opacity="0" />`,
        );
        hasVisibleRect = true;
      });

      const shouldDimBackground =
        hasVisibleRect && maskTargets.length > 0 && !hasMissingSelectors;

      if (shouldDimBackground) {
        svgParts.push(`</mask>`, `</defs>`);
        svgParts.push(
          `<rect x="0" y="0" width="${viewportWidth}" height="${viewportHeight}" fill="white" mask="url(#${maskId})" />`,
        );
        const svg = `${svgParts.join("")}</svg>`;
        const encoded = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        overlayElement.style.backgroundColor = "rgba(15, 23, 42, 0.65)";
        overlayElement.style.maskImage = encoded;
        overlayElement.style.webkitMaskImage = encoded;
        const sizeValue = `${viewportWidth}px ${viewportHeight}px`;
        overlayElement.style.maskSize = sizeValue;
        overlayElement.style.webkitMaskSize = sizeValue;
        overlayElement.style.maskRepeat = "no-repeat";
        overlayElement.style.webkitMaskRepeat = "no-repeat";
      } else {
        overlayElement.style.maskImage = "none";
        overlayElement.style.webkitMaskImage = "none";
        overlayElement.style.maskSize = "";
        overlayElement.style.webkitMaskSize = "";
        overlayElement.style.maskRepeat = "";
        overlayElement.style.webkitMaskRepeat = "";
        overlayElement.style.backgroundColor = "transparent";
      }

      spotlightEntries.forEach(({ outline, element, padding: paddingAmount, role }) => {
        const rect = element.getBoundingClientRect();
        const expandedWidth = rect.width + paddingAmount * 2;
        const expandedHeight = rect.height + paddingAmount * 2;
        const expandedLeft = rect.left - paddingAmount;
        const expandedTop = rect.top - paddingAmount;
        outline.style.top = `${Math.floor(expandedTop)}px`;
        outline.style.left = `${Math.floor(expandedLeft)}px`;
        outline.style.width = `${Math.max(0, Math.ceil(expandedWidth))}px`;
        outline.style.height = `${Math.max(0, Math.ceil(expandedHeight))}px`;
        if (role === "mask") {
          outline.style.opacity = shouldDimBackground ? "0" : "1";
        }
      });
    };

    updateOverlay();

    let rafId = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateOverlay();
      });
    };

    const handleScroll = () => scheduleUpdate();
    const handleResize = () => scheduleUpdate();

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize, true);

    let resizeObserver = null;
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => scheduleUpdate());
      maskTargets.forEach(({ element }) => {
        try {
          resizeObserver.observe(element);
        } catch (err) {
          // ignore observer errors
        }
      });
    }

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize, true);
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (err) {
          // ignore observer errors
        }
      }
      removeExtraSpotlights();
    };
  }, [removeExtraSpotlights, runTour, tourStepIndex, tourSteps]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return undefined;
    }
    if (!runTour) {
      removeMissingTargetArrow();
      return undefined;
    }
    const step = tourSteps[tourStepIndex];
    if (!step || !step.missingTargetPauseStep) {
      removeMissingTargetArrow();
      return undefined;
    }

    if (step.missingTargetPauseHasArrow !== true) {
      removeMissingTargetArrow();
      return undefined;
    }

    removeMissingTargetArrow();

    const selectorsSet = new Set();
    const addSelector = (value) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      selectorsSet.add(trimmed);
    };

    addSelector(step.missingTargetPauseArrowSelector);
    coerceSelectorArray(step.highlightSelectors).forEach(addSelector);
    coerceSelectorArray(step.selectors).forEach(addSelector);

    const selectors = Array.from(selectorsSet);

    const markerValue =
      typeof step.missingTargetPauseArrowMarker === "string" &&
      step.missingTargetPauseArrowMarker.trim()
        ? step.missingTargetPauseArrowMarker.trim()
        : "";

    const storedRectRaw =
      step.missingTargetPauseArrowRect &&
      typeof step.missingTargetPauseArrowRect === "object"
        ? step.missingTargetPauseArrowRect
        : null;
    const storedRect = storedRectRaw
      ? {
          top: Number(storedRectRaw.top) || 0,
          left: Number(storedRectRaw.left) || 0,
          width: Number(storedRectRaw.width) || 0,
          height: Number(storedRectRaw.height) || 0,
        }
      : null;

    if (!selectors.length && !storedRect) {
      return undefined;
    }

    const overlay = document.createElement("div");
    overlay.className = "tour-missing-target-arrow-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "10002",
      pointerEvents: "none",
      fontFamily: "inherit",
    });
    document.body.appendChild(overlay);

    const callout = document.createElement("div");
    callout.className = "tour-missing-target-arrow";
    Object.assign(callout.style, {
      position: "absolute",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      justifyContent: "center",
      pointerEvents: "none",
      color: "#fff",
      fontWeight: "700",
      fontSize: "16px",
      textAlign: "center",
      maxWidth: "calc(100vw - 48px)",
      filter: "drop-shadow(0 14px 28px rgba(15, 23, 42, 0.4))",
      transition: "transform 0.2s ease, top 0.2s ease, left 0.2s ease",
    });
    overlay.appendChild(callout);

    const bubble = document.createElement("div");
    bubble.className = "tour-missing-target-arrow-text";
    const arrowMessage =
      typeof step.missingTargetPauseArrowMessage === "string" &&
      step.missingTargetPauseArrowMessage.trim()
        ? step.missingTargetPauseArrowMessage.trim()
        : "Press here to reveal the next control";
    bubble.textContent = arrowMessage;
    Object.assign(bubble.style, {
      background: "linear-gradient(135deg, #fb923c, #f97316)",
      padding: "18px 22px",
      borderRadius: "18px",
      lineHeight: "1.4",
      letterSpacing: "0.01em",
      boxShadow: "0 22px 42px rgba(15, 23, 42, 0.45)",
      pointerEvents: "none",
      fontSize: "18px",
    });

    const pointer = document.createElement("div");
    pointer.className = "tour-missing-target-arrow-pointer";
    Object.assign(pointer.style, {
      width: "0",
      height: "0",
      borderLeft: "20px solid transparent",
      borderRight: "20px solid transparent",
      pointerEvents: "none",
    });

    callout.appendChild(bubble);
    callout.appendChild(pointer);

    const entry = {
      container: overlay,
      callout,
      bubble,
      pointer,
      selectors,
      storedRect,
      trackedElement: null,
      orientation: null,
      rafId: null,
      handleScroll: null,
      handleResize: null,
      resizeObserver: null,
      markerAttribute: MISSING_TARGET_ARROW_ATTRIBUTE,
      markerValue,
    };

    const findElement = () => {
      for (const selector of selectors) {
        if (!selector) continue;
        try {
          const element = document.querySelector(selector);
          if (element) {
            return element;
          }
        } catch (err) {
          // ignore invalid selectors
        }
      }
      return null;
    };

    entry.trackedElement = findElement();

    if (
      entry.markerAttribute &&
      entry.markerValue &&
      entry.trackedElement?.setAttribute
    ) {
      try {
        entry.trackedElement.setAttribute(
          entry.markerAttribute,
          entry.markerValue,
        );
      } catch (err) {
        // ignore attribute errors
      }
    }

    const getRect = () => {
      if (entry.trackedElement) {
        const rect = entry.trackedElement.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) {
          return rect;
        }
      }
      const nextElement = findElement();
      if (nextElement) {
        entry.trackedElement = nextElement;
        if (
          entry.markerAttribute &&
          entry.markerValue &&
          entry.trackedElement?.setAttribute
        ) {
          try {
            entry.trackedElement.setAttribute(
              entry.markerAttribute,
              entry.markerValue,
            );
          } catch (err) {
            // ignore attribute errors
          }
        }
        const rect = nextElement.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) {
          return rect;
        }
      }
      if (storedRect) {
        return storedRect;
      }
      return null;
    };

    const applyOrientation = (nextOrientation) => {
      if (entry.orientation === nextOrientation) return;
      entry.orientation = nextOrientation;
      callout.style.flexDirection = "column";
      if (nextOrientation === "above") {
        bubble.style.order = "1";
        pointer.style.order = "2";
        pointer.style.marginTop = "10px";
        pointer.style.marginBottom = "0";
        pointer.style.borderTop = "26px solid #f97316";
        pointer.style.borderBottom = "0";
      } else {
        bubble.style.order = "2";
        pointer.style.order = "1";
        pointer.style.marginTop = "0";
        pointer.style.marginBottom = "10px";
        pointer.style.borderTop = "0";
        pointer.style.borderBottom = "26px solid #f97316";
      }
    };

    const updatePositions = () => {
      const rect = getRect();
      if (!rect) {
        overlay.style.display = "none";
        return;
      }
      overlay.style.display = "block";

      const viewportWidth =
        window.innerWidth || document.documentElement?.clientWidth || 0;
      const viewportHeight =
        window.innerHeight || document.documentElement?.clientHeight || 0;
      const width = Math.max(240, Math.min(320, viewportWidth - 48));
      const halfWidth = width / 2;
      const targetCenterX = rect.left + rect.width / 2;
      const clampedCenterX = Math.min(
        Math.max(targetCenterX, halfWidth + 24),
        viewportWidth - halfWidth - 24,
      );
      callout.style.width = `${Math.round(width)}px`;
      callout.style.left = `${Math.round(clampedCenterX)}px`;

      const gap = 32;
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - (rect.top + rect.height);
      const nextOrientation =
        spaceAbove < 140 && spaceBelow > spaceAbove ? "below" : "above";
      applyOrientation(nextOrientation);

      if (entry.orientation === "above") {
        callout.style.top = `${Math.round(rect.top)}px`;
        callout.style.transform = `translate(-50%, calc(-100% - ${gap}px))`;
      } else {
        callout.style.top = `${Math.round(rect.top + rect.height)}px`;
        callout.style.transform = `translate(-50%, ${gap}px)`;
      }
    };

    const scheduleUpdate = () => {
      if (entry.rafId !== null) return;
      entry.rafId = window.requestAnimationFrame(() => {
        entry.rafId = null;
        updatePositions();
      });
    };

    entry.handleScroll = () => scheduleUpdate();
    entry.handleResize = () => scheduleUpdate();

    window.addEventListener("scroll", entry.handleScroll, true);
    window.addEventListener("resize", entry.handleResize, true);

    if (typeof ResizeObserver === "function") {
      entry.resizeObserver = new ResizeObserver(() => scheduleUpdate());
      const observerTarget = entry.trackedElement || findElement();
      if (observerTarget) {
        entry.trackedElement = observerTarget;
        try {
          entry.resizeObserver.observe(observerTarget);
        } catch (err) {
          // ignore observer errors
        }
      }
    }

    missingTargetArrowRef.current = entry;

    updatePositions();

    return () => {
      removeMissingTargetArrow();
    };
  }, [removeMissingTargetArrow, runTour, tourStepIndex, tourSteps]);

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

      const viewerPath = tourViewerState.path || location.pathname;
      const registryEntry =
        typeof getTourForPath === "function" ? getTourForPath(viewerPath) : null;
      const registrySteps = Array.isArray(registryEntry?.steps)
        ? registryEntry.steps
        : null;

      const sourceSteps =
        registryEntry?.pageKey === tourViewerState.pageKey &&
        registrySteps &&
        registrySteps.length
          ? registrySteps
          : Array.isArray(tourViewerState.steps)
            ? tourViewerState.steps
            : [];

      const cleanedSteps = sanitizeTourStepsForRestart(sourceSteps);
      if (!cleanedSteps.length) return;

      const numericIndex = Number(stepIndex);
      const safeIndex = Number.isFinite(numericIndex) ? numericIndex : 0;
      const clampedIndex = Math.min(Math.max(0, safeIndex), cleanedSteps.length - 1);

      setTourViewerState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: cleanedSteps,
          currentStepIndex: clampedIndex,
        };
      });

      setTourStepIndex(clampedIndex);

      const startPath = registryEntry?.path || viewerPath;

      startTour(tourViewerState.pageKey, cleanedSteps, {
        force: true,
        path: startPath,
        stepIndex: clampedIndex,
      });
    },
    [
      getTourForPath,
      location.pathname,
      startTour,
      tourViewerState,
    ],
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

  const hasSupervisor =
    Number(session?.senior_empid) > 0 || Number(session?.senior_plan_empid) > 0;
  const seniorEmpId =
    session && user?.empid && !hasSupervisor ? user.empid : null;
  const seniorPlanEmpId = hasSupervisor ? session?.senior_plan_empid : null;

  const reportFilters = useMemo(
    () => ({ request_type: 'report_approval' }),
    [],
  );
  const editFilters = useMemo(
    () => ({ request_type: 'edit' }),
    [],
  );
  const deleteFilters = useMemo(
    () => ({ request_type: 'delete' }),
    [],
  );

  const reportNotifications = useRequestNotificationCounts(
    seniorEmpId,
    reportFilters,
    user?.empid,
    seniorPlanEmpId,
    { storageNamespace: 'report_approval' },
  );
  const editNotifications = useRequestNotificationCounts(
    seniorEmpId,
    editFilters,
    user?.empid,
    seniorPlanEmpId,
    { storageNamespace: 'request_edit' },
  );
  const deleteNotifications = useRequestNotificationCounts(
    seniorEmpId,
    deleteFilters,
    user?.empid,
    seniorPlanEmpId,
    { storageNamespace: 'request_delete' },
  );
  const temporaryNotifications = useTemporaryNotificationCounts(user?.empid);

  const reportWorkflow = useWorkflowEntry(reportNotifications);
  const editWorkflow = useWorkflowEntry(editNotifications);
  const deleteWorkflow = useWorkflowEntry(deleteNotifications);
  const changeWorkflow = useWorkflowEntry(editNotifications, deleteNotifications);

  const aggregatedIncoming = useMemo(
    () =>
      mergeStatusMaps([
        reportWorkflow.incoming,
        editWorkflow.incoming,
        deleteWorkflow.incoming,
      ]),
    [
      reportWorkflow.incoming,
      editWorkflow.incoming,
      deleteWorkflow.incoming,
    ],
  );

  const aggregatedOutgoing = useMemo(
    () =>
      mergeStatusMaps([
        reportWorkflow.outgoing,
        editWorkflow.outgoing,
        deleteWorkflow.outgoing,
      ]),
    [
      reportWorkflow.outgoing,
      editWorkflow.outgoing,
      deleteWorkflow.outgoing,
    ],
  );

  const requestHasNew = useMemo(
    () => hasAnyNew(aggregatedIncoming, aggregatedOutgoing),
    [aggregatedIncoming, aggregatedOutgoing],
  );

  const markAll = useCallback(() => {
    reportWorkflow.markSeen();
    editWorkflow.markSeen();
    deleteWorkflow.markSeen();
  }, [
    reportWorkflow.markSeen,
    editWorkflow.markSeen,
    deleteWorkflow.markSeen,
  ]);

  const markIncomingStatuses = useCallback(
    (statuses) => {
      reportWorkflow.markIncoming(statuses);
      editWorkflow.markIncoming(statuses);
      deleteWorkflow.markIncoming(statuses);
    },
    [
      reportWorkflow.markIncoming,
      editWorkflow.markIncoming,
      deleteWorkflow.markIncoming,
    ],
  );

  const markOutgoingStatuses = useCallback(
    (statuses) => {
      reportWorkflow.markOutgoing(statuses);
      editWorkflow.markOutgoing(statuses);
      deleteWorkflow.markOutgoing(statuses);
    },
    [
      reportWorkflow.markOutgoing,
      editWorkflow.markOutgoing,
      deleteWorkflow.markOutgoing,
    ],
  );

  const markWorkflowSeen = useCallback(
    (workflowKey, scope, statuses) => {
      const normalizedScope =
        typeof scope === 'string' ? scope.trim().toLowerCase() : '';
      const normalizedStatuses = Array.isArray(statuses)
        ? Array.from(
            new Set(
              statuses
                .map((status) => String(status || '').trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : undefined;

      const applyMark = (workflow) => {
        if (!workflow) return;
        if (normalizedScope === 'incoming') {
          if (normalizedStatuses && normalizedStatuses.length) {
            workflow.markIncoming(normalizedStatuses);
          } else {
            workflow.markIncoming();
          }
        } else if (normalizedScope === 'outgoing') {
          if (normalizedStatuses && normalizedStatuses.length) {
            workflow.markOutgoing(normalizedStatuses);
          } else {
            workflow.markOutgoing();
          }
        } else {
          workflow.markSeen();
        }
      };

      switch (workflowKey) {
        case 'report_approval':
        case 'reportApproval':
          applyMark(reportWorkflow);
          break;
        case 'change_requests':
        case 'changeRequests':
          applyMark(changeWorkflow);
          break;
        case 'edit':
          applyMark(editWorkflow);
          break;
        case 'delete':
          applyMark(deleteWorkflow);
          break;
        default:
          markAll();
          break;
      }
    },
    [
      reportWorkflow,
      changeWorkflow,
      editWorkflow,
      deleteWorkflow,
      markAll,
    ],
  );

  const pendingRequestSummary = useMemo(
    () => ({
      contextValue: {
        incoming: aggregatedIncoming,
        outgoing: aggregatedOutgoing,
        hasNew: requestHasNew,
        markSeen: markAll,
        markIncoming: markIncomingStatuses,
        markOutgoing: markOutgoingStatuses,
        markWorkflowSeen,
        workflows: {
          reportApproval: reportWorkflow,
          changeRequests: changeWorkflow,
          edit: editWorkflow,
          delete: deleteWorkflow,
        },
      },
      requestHasNew,
    }),
    [
      aggregatedIncoming,
      aggregatedOutgoing,
      requestHasNew,
      markAll,
      markIncomingStatuses,
      markOutgoingStatuses,
      markWorkflowSeen,
      reportWorkflow,
      changeWorkflow,
      editWorkflow,
      deleteWorkflow,
    ],
  );

  const {
    counts: temporaryCounts,
    hasNew: temporaryHasNew,
    markScopeSeen: rawTemporaryMarkScopeSeen,
    markAllSeen: rawTemporaryMarkAllSeen,
    fetchScopeEntries: rawTemporaryFetchScopeEntries,
  } = temporaryNotifications || {};

  const markTemporaryScopeSeen = useCallback(
    (...args) => rawTemporaryMarkScopeSeen?.(...args),
    [rawTemporaryMarkScopeSeen],
  );

  const markTemporaryAllSeen = useCallback(
    () => rawTemporaryMarkAllSeen?.(),
    [rawTemporaryMarkAllSeen],
  );

  const fetchTemporaryScopeEntries = useCallback(
    (...args) => rawTemporaryFetchScopeEntries?.(...args),
    [rawTemporaryFetchScopeEntries],
  );

  const temporaryCreatedCount = Number(temporaryCounts?.created?.count) || 0;
  const temporaryCreatedNewCount = Number(temporaryCounts?.created?.newCount) || 0;
  const temporaryReviewCount = Number(temporaryCounts?.review?.count) || 0;
  const temporaryReviewNewCount = Number(temporaryCounts?.review?.newCount) || 0;

  const notificationStatusTotals = useMemo(
    () => {
      const totals = { pending: 0, accepted: 0, declined: 0 };
      REQUEST_STATUS_KEYS.forEach((status) => {
        const incomingNew = Number(aggregatedIncoming?.[status]?.newCount) || 0;
        const outgoingNew = Number(aggregatedOutgoing?.[status]?.newCount) || 0;
        totals[status] = incomingNew + outgoingNew;
      });
      totals.pending += temporaryCreatedNewCount + temporaryReviewNewCount;
      return totals;
    },
    [
      aggregatedIncoming,
      aggregatedOutgoing,
      temporaryCreatedNewCount,
      temporaryReviewNewCount,
    ],
  );

  const notificationColors = useMemo(() => {
    const colors = [];
    NOTIFICATION_STATUS_ORDER.forEach((status) => {
      if (notificationStatusTotals[status] > 0) {
        colors.push(NOTIFICATION_STATUS_COLORS[status]);
      }
    });
    return colors;
  }, [notificationStatusTotals]);

  const selectedNotificationSound = useMemo(
    () => (userSettings?.notificationSound || 'chime').trim(),
    [userSettings?.notificationSound],
  );

  const notificationTotalsRef = useRef(notificationStatusTotals);

  useEffect(() => {
    const prev = notificationTotalsRef.current;
    notificationTotalsRef.current = notificationStatusTotals;
    if (!prev) return;
    const hasIncrease = NOTIFICATION_STATUS_ORDER.some(
      (status) => notificationStatusTotals[status] > (prev[status] || 0),
    );
    if (hasIncrease) {
      playNotificationSound(selectedNotificationSound);
    }
  }, [notificationStatusTotals, selectedNotificationSound]);

  const temporaryValue = useMemo(
    () => ({
      counts: temporaryCounts,
      hasNew: temporaryHasNew,
      markScopeSeen: markTemporaryScopeSeen,
      markAllSeen: markTemporaryAllSeen,
      fetchScopeEntries: fetchTemporaryScopeEntries,
    }),
    [
      temporaryCreatedCount,
      temporaryCreatedNewCount,
      temporaryReviewCount,
      temporaryReviewNewCount,
      temporaryHasNew,
      markTemporaryScopeSeen,
      markTemporaryAllSeen,
      fetchTemporaryScopeEntries,
    ],
  );

  const pendingRequestValue = useMemo(
    () => ({
      ...pendingRequestSummary.contextValue,
      temporary: temporaryValue,
      notificationColors,
      notificationStatusTotals,
      anyHasNew: pendingRequestSummary.requestHasNew || temporaryHasNew,
    }),
    [
      notificationColors,
      notificationStatusTotals,
      pendingRequestSummary,
      temporaryHasNew,
      temporaryValue,
    ],
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
      isTourGuideMode,
      setTourGuideMode: setIsTourGuideMode,
      toggleTourGuideMode,
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
      isTourGuideMode,
      toggleTourGuideMode,
    ],
  );

  return (
    <PollingProvider>
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
            guideMode={isTourGuideMode}
            onToggleGuideMode={toggleTourGuideMode}
          />
        )}
        <PendingRequestContext.Provider value={pendingRequestValue}>
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
                options: {
                  zIndex: 12000,
                },
                overlay: {
                  backgroundColor: joyrideOverlayColor,
                  pointerEvents: isTourGuideMode ? 'none' : 'auto',
                },
                spotlight: {
                  borderRadius: 12,
                  boxShadow: joyrideSpotlightShadow,
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
              hasUpdateAvailable={hasUpdateAvailable}
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
    </PollingProvider>
  );
}

/** Top header bar **/
export function Header({
  user,
  onLogout,
  onHome,
  isMobile,
  onToggleSidebar,
  onOpen,
  onResetGuide,
  hasUpdateAvailable = false,
}) {
  const { session, workplacePositionMap } = useContext(AuthContext);
  const { lang, setLang, t } = useContext(LangContext);
  const { anyHasNew, notificationColors } = useContext(PendingRequestContext);
  const handleRefresh = () => {
    if (typeof window === 'undefined' || !window?.location) return;
    try {
      window.location.reload(true);
    } catch (err) {
      if (typeof window.location.reload === 'function') {
        window.location.reload();
      }
    }
  };

  const headerNotificationColors = useMemo(() => {
    if (notificationColors?.length) return notificationColors;
    if (anyHasNew) return [NOTIFICATION_STATUS_COLORS.pending];
    return [];
  }, [anyHasNew, notificationColors]);

  const [positionLabel, setPositionLabel] = useState(null);
  const workplacePositions = workplacePositionMap || {};

  const normalizeText = useCallback((value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }, []);

  const preferNameLikeText = useCallback(
    (value) => {
      const text = normalizeText(value);
      if (!text) return null;
      if (/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
      return text;
    },
    [normalizeText],
  );

  const workplaceLabels = useMemo(() => {
    if (!session) return [];
    const assignments = Array.isArray(session.workplace_assignments)
      ? session.workplace_assignments
      : [];
    const labels = [];
    const seenComposite = new Set();
    const seenSessionIds = new Set();
    const buildPositionSuffix = (workplaceId) => {
      if (workplaceId === null || workplaceId === undefined) return null;
      const entry = workplacePositions?.[workplaceId];
      if (!entry) return null;
      const idValue =
        entry.positionId === null || entry.positionId === undefined
          ? null
          : String(entry.positionId).trim();
      const idText = idValue ? `#${idValue}` : '';
      const nameText = preferNameLikeText(entry.positionName) ?? normalizeText(entry.positionName);
      const parts = [idText, nameText].filter(Boolean);
      if (parts.length === 0) return null;
      return `position ${parts.join(' · ')}`;
    };
    const parseId = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    assignments.forEach((assignment) => {
      if (!assignment || typeof assignment !== 'object') return;
      const workplaceId =
        assignment.workplace_id !== undefined
          ? assignment.workplace_id
          : assignment.workplaceId;
      const normalizedWorkplaceId = parseId(workplaceId);
      const compositeKey = [
        normalizedWorkplaceId ?? '',
        normalizeText(assignment.workplace_name) ?? '',
        normalizeText(assignment.department_name) ?? '',
        normalizeText(assignment.branch_name) ?? '',
      ].join('|');
      if (seenComposite.has(compositeKey)) return;
      seenComposite.add(compositeKey);
      const idParts = [];
      if (normalizedWorkplaceId != null) {
        idParts.push(`#${normalizedWorkplaceId}`);
      }
      const idLabel = idParts.join(' · ');
      const baseName = assignment.workplace_name ?? assignment.workplaceName
        ? String(assignment.workplace_name ?? assignment.workplaceName).trim()
        : '';
      const contextParts = [];
      if (assignment.department_name ?? assignment.departmentName) {
        contextParts.push(
          String(assignment.department_name ?? assignment.departmentName).trim(),
        );
      }
      if (assignment.branch_name ?? assignment.branchName) {
        contextParts.push(String(assignment.branch_name ?? assignment.branchName).trim());
      }
      const context = contextParts.filter(Boolean).join(' / ');
      const positionSuffix = buildPositionSuffix(normalizedWorkplaceId ?? workplaceId);
      const labelParts = [idLabel, baseName, context, positionSuffix].filter(
        (part) => part && part.length,
      );
      if (!labelParts.length && normalizedWorkplaceId != null) {
        labelParts.push(`Workplace #${normalizedWorkplaceId}`);
      }
      if (labelParts.length) {
        labels.push(labelParts.join(' – '));
      }
    });
    if (!labels.length) {
      const idParts = [];
      if (session.workplace_id != null) {
        idParts.push(`#${session.workplace_id}`);
      }
      const baseName = session.workplace_name ?? session.workplaceName
        ? String(session.workplace_name ?? session.workplaceName).trim()
        : '';
      const contextParts = [];
      if (session.department_name ?? session.departmentName) {
        contextParts.push(String(session.department_name ?? session.departmentName).trim());
      }
      if (session.branch_name ?? session.branchName) {
        contextParts.push(String(session.branch_name ?? session.branchName).trim());
      }
      const context = contextParts.filter(Boolean).join(' / ');
      const positionSuffix = buildPositionSuffix(session.workplace_id ?? session.workplaceId);
      const fallbackParts = [idParts.join(' · '), baseName, context, positionSuffix].filter(
        (part) => part && part.length,
      );
      if (fallbackParts.length) {
        labels.push(fallbackParts.join(' – '));
      }
    }
    return labels;
  }, [normalizeText, preferNameLikeText, session, workplacePositions]);

  const userDetails = useMemo(() => {
    const items = [];
    if (session?.company_name) {
      items.push({
        label: t('userMenu.company', 'Company'),
        value: session.company_name,
        icon: '🏢',
      });
    }
    if (workplaceLabels.length > 0) {
      items.push({
        label: t('userMenu.workplace', 'Workplace'),
        value: workplaceLabels.filter(Boolean).join(', '),
        icon: '🏭',
      });
    }
    if (session?.pos_name) {
      const posParts = [session.pos_name];
      const posNo =
        session.pos_no ??
        session.posNo ??
        session.pos_number ??
        session.posNumber ??
        null;
      if (posNo !== null && posNo !== undefined) {
        posParts.push(`#${posNo}`);
      }
      items.push({
        label: t('userMenu.pos', 'POS'),
        value: posParts.join(' · '),
        icon: '🧾',
      });
    }
    if (session?.user_level_name) {
      items.push({
        label: t('userMenu.role', 'Role'),
        value: session.user_level_name,
        icon: '👤',
      });
    }
    if (positionLabel) {
      items.push({
        label: t('userMenu.position', 'Position'),
        value: positionLabel,
        icon: '🧑‍💼',
      });
    }
    return items;
  }, [positionLabel, session?.company_name, session?.user_level_name, t, workplaceLabels]);

  const matchedAssignment = useMemo(() => {
    const assignments = Array.isArray(session?.workplace_assignments)
      ? session.workplace_assignments
      : [];
    const currentWorkplaceId = session?.workplace_id ?? session?.workplaceId ?? null;
    return (
      assignments.find((assignment) => {
        const assignmentWorkplaceId =
          assignment?.workplace_id ?? assignment?.workplaceId ?? assignment?.id ?? null;
        return (
          currentWorkplaceId !== null &&
          currentWorkplaceId !== undefined &&
          assignmentWorkplaceId !== null &&
          assignmentWorkplaceId !== undefined &&
          assignmentWorkplaceId === currentWorkplaceId
        );
      }) || null
    );
  }, [session]);

  const positionNameCandidate = useMemo(() => {
    const candidates = [
      matchedAssignment?.position_name,
      matchedAssignment?.positionName,
      matchedAssignment?.workplace_position_name,
      matchedAssignment?.workplacePositionName,
      matchedAssignment?.employment_position_name,
      matchedAssignment?.employmentPositionName,
      matchedAssignment?.position,
      session?.position_name,
      session?.positionName,
      session?.employment_position_name,
      session?.employmentPositionName,
      session?.position,
    ];
    const normalized = candidates
      .map((value) => preferNameLikeText(value))
      .find((value) => value && value.length);
    return normalized || null;
  }, [matchedAssignment, preferNameLikeText, session]);

  const positionIdentifier = useMemo(() => {
    const candidates = [
      matchedAssignment?.employment_position_id,
      matchedAssignment?.position_id,
      matchedAssignment?.positionId,
      matchedAssignment?.position,
      session?.employment_position_id,
      session?.employmentPositionId,
      session?.position_id,
      session?.positionId,
      session?.position,
    ];
    const resolved = candidates
      .map((value) => normalizeText(value))
      .find((value) => value && value.length);
    return resolved || null;
  }, [matchedAssignment, normalizeText, session]);

  useEffect(() => {
    let isCancelled = false;
    const setIfActive = (label) => {
      if (!isCancelled) setPositionLabel(label);
    };

    if (positionNameCandidate) {
      setIfActive(positionNameCandidate);
      return () => {
        isCancelled = true;
      };
    }

    setIfActive(null);

    const positionValue =
      positionIdentifier === null || positionIdentifier === undefined
        ? null
        : String(positionIdentifier).trim();
    if (!positionValue) {
      return () => {
        isCancelled = true;
      };
    }

    const resolvePositionName = async () => {
      try {
        const cfgRes = await fetch('/api/display_fields?table=code_position', {
          credentials: 'include',
        });
        const cfg = cfgRes.ok ? await cfgRes.json() : {};
        const configuredIdField =
          (typeof cfg?.idField === 'string' && cfg.idField.trim()) ||
          (typeof cfg?.id_field === 'string' && cfg.id_field.trim()) ||
          '';
        const configuredDisplayFields = Array.isArray(cfg?.displayFields)
          ? cfg.displayFields.filter(
              (field) => typeof field === 'string' && field.trim().length > 0,
            )
          : [];
        const hasConfiguredTable =
          Boolean(configuredIdField) || configuredDisplayFields.length > 0;

        const idField = configuredIdField || 'position_id';
        const displayFields =
          hasConfiguredTable && configuredDisplayFields.length > 0
            ? configuredDisplayFields
            : ['position_name'];

        const params = new URLSearchParams();
        params.set(idField, positionValue);
        params.set('perPage', '1');

        const res = await fetch(`/api/tables/code_position?${params.toString()}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const rows = Array.isArray(data.rows) ? data.rows : [];
          if (rows.length > 0) {
            const options = await buildOptionsForRows({
              table: 'code_position',
              rows,
              idField,
              searchColumn: idField,
              labelFields: displayFields,
              companyId: session?.company_id ?? session?.companyId ?? null,
            });
            const match = options.find(
              (opt) =>
                opt?.value !== undefined &&
                opt?.value !== null &&
                String(opt.value).trim() === positionValue,
            );
            const fallbackRow = rows[0] || {};
            const fallbackLabel =
              displayFields
                .map((field) => {
                  const lower = field.toLowerCase();
                  const matchingKey = Object.keys(fallbackRow || {}).find(
                    (key) => key.toLowerCase() === lower,
                  );
                  return matchingKey ? normalizeText(fallbackRow[matchingKey]) : null;
                })
                .find((val) => val && val.length) ??
              normalizeText(fallbackRow.position_name) ??
              normalizeText(fallbackRow.name) ??
              normalizeText(fallbackRow.position);
            setIfActive(match?.label || fallbackLabel || positionValue);
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to resolve position label', err);
      }
      setIfActive(positionValue);
    };

    resolvePositionName();

    return () => {
      isCancelled = true;
    };
  }, [
    normalizeText,
    positionIdentifier,
    positionNameCandidate,
    session?.companyId,
    session?.company_id,
  ]);

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
        <button
          style={styles.iconBtn}
          onClick={() =>
            onOpen('/notifications', t('notifications', 'Notifications'), 'notifications')
          }
        >
          <span style={styles.inlineButtonContent}>
            <NotificationDots colors={headerNotificationColors} marginRight={0} />
            <span aria-hidden="true">🔔</span> {t('notifications', 'Notifications')}
          </span>
        </button>
        <button style={styles.iconBtn}>❔ {t("help")}</button>
      </nav>
      {hasUpdateAvailable && (
        <button type="button" style={styles.updateButton} onClick={handleRefresh}>
          🔄 {t('refresh_to_update', 'Refresh to update')}
        </button>
      )}
      <HeaderMenu onOpen={onOpen} />
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
        <UserMenu
          user={user}
          onLogout={onLogout}
          onResetGuide={onResetGuide}
          details={userDetails}
        />
      </div>
    </header>
  );
}

/** Left sidebar with “menu groups” and “pinned items” **/
function Sidebar({ onOpen, open, isMobile }) {
  const { permissions: perms, user, setUser } = useContext(AuthContext);
  const { t } = useContext(LangContext);
  const location = useLocation();
  const navigate = useNavigate();
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));
  const { hasNew, anyHasNew, notificationColors, temporary } = useContext(PendingRequestContext);
  const hasTemporaryNew = Boolean(temporary?.hasNew);

  const sidebarNotificationColors = useMemo(() => {
    if (notificationColors?.length) return notificationColors;
    if (anyHasNew) return [NOTIFICATION_STATUS_COLORS.pending];
    return [];
  }, [anyHasNew, notificationColors]);

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

  const hasNotificationTrail = sidebarNotificationColors.length > 0 || hasNew || hasTemporaryNew;
  const badgeKeys = new Set();
  if (hasNotificationTrail) {
    const addTrail = (targetKey) => {
      let cur = allMap[targetKey];
      while (cur) {
        badgeKeys.add(cur.module_key);
        cur = cur.parent_key ? allMap[cur.parent_key] : null;
      }
    };
    if (allMap['requests']) addTrail('requests');
    if (hasTemporaryNew && allMap['forms']) addTrail('forms');
  }

  async function handleExit() {
    await logout(user?.empid);
    setUser(null);
    navigate('/login');
  }

  return (
    <aside
      id="sidebar"
      className={`sidebar ${open ? 'open' : ''}`}
      style={styles.sidebar(isMobile, open)}
    >
      <nav className="menu-container">
        <button
          key="__notifications"
          onClick={() =>
            onOpen('/notifications', t('notifications', 'Notifications'), 'notifications')
          }
          className="menu-item"
          style={styles.menuItem({ isActive: location.pathname === '/notifications' })}
        >
          <NotificationDots
            colors={sidebarNotificationColors}
            size="0.55rem"
            gap="0.2rem"
          />
          {t('notifications', 'Notifications')}
        </button>
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
              sidebarNotificationColors={sidebarNotificationColors}
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
              {badgeKeys.has(m.module_key) && (
                <NotificationDots
                  colors={sidebarNotificationColors}
                  size="0.45rem"
                  gap="0.15rem"
                  marginRight="0.35rem"
                />
              )}
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
      <div style={styles.sidebarFooter}>
        <button type="button" style={styles.exitButton} onClick={handleExit}>
          {t('exit', 'Exit')}
        </button>
      </div>
    </aside>
  );
}

function SidebarGroup({
  mod,
  map,
  allMap,
  level,
  onOpen,
  badgeKeys,
  generalConfig,
  headerMap,
  sidebarNotificationColors,
}) {
  const [open, setOpen] = useState(false);
  const { t } = useContext(LangContext);
  const groupClass =
    level === 0 ? 'menu-group' : level === 1 ? 'menu-group submenu' : 'menu-group subsubmenu';
  return (
    <div className={groupClass} style={{ ...styles.menuGroup, paddingLeft: level ? '1rem' : 0 }}>
      <button className="menu-item" style={styles.groupBtn} onClick={() => setOpen((o) => !o)}>
        {badgeKeys.has(mod.module_key) && (
          <NotificationDots
            colors={sidebarNotificationColors}
            size="0.45rem"
            gap="0.15rem"
            marginRight="0.35rem"
          />
        )}
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
              sidebarNotificationColors={sidebarNotificationColors}
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
              {badgeKeys.has(c.module_key) && (
                <NotificationDots
                  colors={sidebarNotificationColors}
                  size="0.45rem"
                  gap="0.15rem"
                  marginRight="0.35rem"
                />
              )}
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
  const { hasNew, anyHasNew, notificationColors, temporary } = useContext(PendingRequestContext);
  const hasTemporaryNew = Boolean(temporary?.hasNew);
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
  const toastApi = useToast();
  const addToast = useCallback(
    (message, type) => {
      if (toastApi && typeof toastApi.addToast === "function") {
        toastApi.addToast(message, type);
        return;
      }
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        const typeLabel = type ? `[${type}] ` : "";
        console.warn(`${typeLabel}${message}`);
      }
    },
    [toastApi],
  );
  const tabNotificationColors = useMemo(() => {
    if (notificationColors?.length) return notificationColors;
    if (anyHasNew || hasNew) return [NOTIFICATION_STATUS_COLORS.pending];
    return [];
  }, [anyHasNew, hasNew, notificationColors]);
  const badgePaths = useMemo(() => {
    const paths = new Set();
    if (tabNotificationColors.length > 0) {
      paths.add('/');
      paths.add('/requests');
      paths.add('/notifications');
      if (hasTemporaryNew) paths.add('/forms');
    }
    return paths;
  }, [hasTemporaryNew, tabNotificationColors]);

  const derivedPageKey = useMemo(() => derivePageKey(location.pathname), [location.pathname]);

  const tabKeys = useMemo(() => new Set(tabs.map((tab) => tab.key)), [tabs]);

  // Store rendered outlet by path once the route changes. Avoid tracking
  // the `outlet` object itself to prevent endless updates caused by React
  // creating a new element on every render.
  useEffect(() => {
    setTabContent(location.pathname, outlet);
  }, [location.pathname, setTabContent]);

  useEffect(() => {
    if (!tabKeys.has(location.pathname)) return;
    if (!activeKey || activeKey === location.pathname) return;
    if (typeof activeKey !== 'string') return;
    if (!activeKey.startsWith('/')) return;
    switchTab(location.pathname);
  }, [activeKey, location.pathname, switchTab, tabKeys]);

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

  const handleViewTour = useCallback(async () => {
    if (!hasTour || !tourInfo?.pageKey) return;

    const resolvedPath = tourInfo.path || location.pathname;
    let entry = tourInfo;

    if (ensureTourDefinition) {
      try {
        const refreshed = await ensureTourDefinition({
          pageKey: tourInfo.pageKey,
          path: resolvedPath,
          forceReload: true,
        });
        if (refreshed) {
          entry = refreshed;
        }
      } catch (err) {
        console.error('Failed to refresh tour before viewing', err);
        addToast(
          t(
            'tour_refresh_failed',
            'Unable to refresh this tour right now. Showing the last saved version.',
          ),
          'warning',
        );
      }
    }

    const steps = Array.isArray(entry?.steps) ? entry.steps : [];
    if (!steps.length) {
      addToast(
        t('tour_missing_steps', 'This tour does not have any available steps to show.'),
        'error',
      );
      return;
    }

    const started = startTour(entry.pageKey, steps, {
      force: true,
      path: entry.path || resolvedPath,
    });

    if (!started) {
      addToast(
        t('tour_start_failed', 'Unable to start the tour right now. Please try again.'),
        'error',
      );
      return;
    }

    openTourViewer?.({
      pageKey: entry.pageKey,
      path: entry.path || resolvedPath,
      steps,
    });
  }, [
    addToast,
    ensureTourDefinition,
    hasTour,
    location.pathname,
    openTourViewer,
    startTour,
    t,
    tourInfo,
  ]);

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
            {(() => {
              const tabHasBadge =
                badgePaths.has(t.key) ||
                (t.key.startsWith('/requests') && badgePaths.has('/requests')) ||
                (t.key.startsWith('/notifications') && badgePaths.has('/notifications')) ||
                (t.key.startsWith('/forms') && badgePaths.has('/forms'));
              if (!tabHasBadge) return null;
              return (
                <NotificationDots
                  colors={tabNotificationColors}
                  size="0.4rem"
                  gap="0.12rem"
                  marginRight="0.35rem"
                />
              );
            })()}
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
    <div
      style={{
        position: 'relative',
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        minHeight: '100%',
        height: '100%',
        flex: '1 1 auto',
      }}
    >
      {loading && <Spinner />}
      <div style={styles.tabPanelContent}>{children}</div>
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
    zIndex: 15030,
    width: "100%",
    left: 0,
    right: 0,
    boxSizing: "border-box",
    paddingLeft: mobile ? "1rem" : "calc(240px + 1rem)",
    gap: "0.5rem",
    minWidth: 0,
    overflow: "visible",
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
    minWidth: 0,
  },
  updateButton: {
    backgroundColor: "#f97316",
    color: "#111827",
    border: "none",
    borderRadius: "4px",
    padding: "0.35rem 0.75rem",
    fontWeight: "bold",
    cursor: "pointer",
    marginRight: "0.75rem",
    flexShrink: 0,
    boxShadow: "0 0 0 2px rgba(249, 115, 22, 0.3)",
  },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.9rem",
    padding: "0.25rem 0.5rem",
  },
  inlineButtonContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
    gap: "0.5rem",
    minWidth: 0,
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
    marginLeft: 0,
    paddingLeft: mobile ? 0 : "240px",
    width: "100%",
    minWidth: 0,
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
    zIndex: 15020,
    paddingBottom: "4rem",
    overscrollBehavior: "contain",
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
  sidebarFooter: {
    marginTop: "auto",
    padding: "0.5rem 0.75rem",
    position: "sticky",
    bottom: 0,
    background: "linear-gradient(180deg, rgba(55,65,81,0.92) 0%, #374151 35%, #1f2937 100%)",
    borderTop: "1px solid #4b5563",
  },
  exitButton: {
    width: "100%",
    backgroundColor: "#dc2626",
    color: "#f9fafb",
    border: "1px solid #b91c1c",
    borderRadius: "4px",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    fontWeight: 600,
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
    position: "relative",
    zIndex: 1100,
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
  tourButtonGroup: {
    display: "inline-flex",
    gap: "0.5rem",
    position: "relative",
    zIndex: 1101,
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
    overflowX: "hidden",
    overflowY: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  tabPanelContent: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowX: "hidden",
    overflowY: "auto",
    padding: "1rem",
  },
};
