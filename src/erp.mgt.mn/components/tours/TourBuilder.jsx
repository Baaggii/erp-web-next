import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TourContext } from '../ERPLayout.jsx';
import LangContext from '../../context/I18nContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import derivePageKey from '../../utils/derivePageKey.js';

const placements = ['auto', 'top', 'bottom', 'left', 'right'];
const cryptoSource = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
const MODAL_MARGIN = 32;

function coerceSelectorValue(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeSelectorsForState(selectors, fallback) {
  const list = Array.isArray(selectors)
    ? selectors.map((value) => coerceSelectorValue(value))
    : [];
  if (list.length) return list;
  const fallbackValue = typeof fallback === 'string' ? fallback.trim() : '';
  return fallbackValue ? [fallbackValue] : [];
}

function derivePrimarySelector(selectors) {
  if (!Array.isArray(selectors)) return '';
  for (const value of selectors) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function normalizeSelectorsForPayload(selectors) {
  if (!Array.isArray(selectors)) return [];
  const seen = new Set();
  const result = [];
  selectors.forEach((value) => {
    const stringValue = typeof value === 'string' ? value : coerceSelectorValue(value);
    const trimmed = stringValue.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

function clamp(value, min, max) {
  if (typeof value !== 'number') return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function createStepId() {
  if (cryptoSource?.randomUUID) {
    return cryptoSource.randomUUID();
  }
  return `tour-step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEditorStep(step, index = 0) {
  if (!step || typeof step !== 'object') {
    return {
      id: createStepId(),
      title: '',
      content: '',
      selector: '',
      target: '',
      selectors: [],
      placement: 'bottom',
      order: index,
    };
  }
  const selectorValue =
    typeof step.selector === 'string' && step.selector.trim()
      ? step.selector.trim()
      : typeof step.target === 'string' && step.target.trim()
        ? step.target.trim()
        : '';
  const selectors = normalizeSelectorsForState(step.selectors, selectorValue);
  const primary = derivePrimarySelector(selectors);
  return {
    id:
      typeof step.id === 'string' && step.id.trim() ? step.id.trim() : createStepId(),
    title: typeof step.title === 'string' ? step.title : '',
    content:
      typeof step.content === 'string' || typeof step.content === 'number'
        ? String(step.content)
        : '',
    selector: primary,
    target: primary,
    selectors,
    placement:
      typeof step.placement === 'string' && step.placement.trim()
        ? step.placement.trim()
        : typeof step.position === 'string' && step.position.trim()
          ? step.position.trim()
          : 'bottom',
    order:
      typeof step.order === 'number' && Number.isFinite(step.order) ? step.order : index,
  };
}

function createEmptyStep(order = 0) {
  return {
    id: createStepId(),
    title: '',
    content: '',
    selector: '',
    target: '',
    selectors: [],
    placement: 'bottom',
    order,
  };
}

function cssEscapeValue(value) {
  if (typeof value !== 'string') return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
}

function buildSelector(element) {
  if (!(element instanceof Element)) return '';
  const attrNames = ['data-tour', 'data-tour-id', 'data-testid'];
  const attrMatch = attrNames
    .map((name) => ({ name, value: element.getAttribute(name) }))
    .find((entry) => entry.value);
  if (element.id) {
    return `#${cssEscapeValue(element.id)}`;
  }
  if (attrMatch?.value) {
    return `[${attrMatch.name}="${cssEscapeValue(attrMatch.value)}"]`;
  }

  const segments = [];
  let current = element;
  let depth = 0;
  while (current && depth < 5) {
    if (current.id) {
      segments.unshift(`#${cssEscapeValue(current.id)}`);
      break;
    }
    const attr = attrNames
      .map((name) => ({ name, value: current.getAttribute(name) }))
      .find((entry) => entry.value);
    if (attr?.value) {
      segments.unshift(`[${attr.name}="${cssEscapeValue(attr.value)}"]`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const classes = Array.from(current.classList || [])
      .filter((cls) => cls && !cls.startsWith('tour-builder'))
      .slice(0, 2)
      .map((cls) => `.${cssEscapeValue(cls)}`)
      .join('');
    let segment = `${tag}${classes}`;
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }
    segments.unshift(segment);
    current = current.parentElement;
    depth += 1;
  }

  if (!segments.length) {
    return element.tagName ? element.tagName.toLowerCase() : '';
  }
  return segments.join(' > ');
}

export default function TourBuilder({ state, onClose }) {
  const {
    ensureTourDefinition,
    saveTourDefinition,
    deleteTourDefinition,
  } = useContext(TourContext);
  const { t } = useContext(LangContext);
  const { addToast } = useToast();
  const initialExplicitPageKey =
    typeof state?.pageKey === 'string' && state.pageKey.trim() ? state.pageKey.trim() : '';
  const fallbackPageKey = useMemo(() => {
    if (typeof state?.derivedPageKey === 'string' && state.derivedPageKey.trim()) {
      return state.derivedPageKey.trim();
    }
    return derivePageKey(state?.path ?? '/');
  }, [state]);
  const [pageKey, setPageKey] = useState(() => initialExplicitPageKey || fallbackPageKey);
  const [path, setPath] = useState(state?.path || '');
  const [steps, setSteps] = useState(() => {
    const initial = Array.isArray(state?.steps) ? state.steps : [];
    return initial.map((step, index) => normalizeEditorStep(step, index));
  });
  const [selectedId, setSelectedId] = useState(() => steps[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [position, setPosition] = useState({ top: null, left: null });
  const [dragging, setDragging] = useState(false);
  const builderRef = useRef(null);
  const highlightRef = useRef({ element: null, outline: '', boxShadow: '' });
  const hasChangesRef = useRef(false);
  const pageKeyTouchedRef = useRef(Boolean(initialExplicitPageKey));
  const dragStateRef = useRef({ active: false, offsetX: 0, offsetY: 0 });

  const clampPosition = useCallback((top, left) => {
    if (typeof window === 'undefined') {
      return { top, left };
    }
    const modal = builderRef.current;
    const modalWidth = modal?.offsetWidth ?? 0;
    const modalHeight = modal?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minLeft = MODAL_MARGIN;
    const minTop = MODAL_MARGIN;
    const maxLeft = Math.max(minLeft, viewportWidth - modalWidth - MODAL_MARGIN);
    const maxTop = Math.max(minTop, viewportHeight - modalHeight - MODAL_MARGIN);
    return {
      top: clamp(top, minTop, maxTop),
      left: clamp(left, minLeft, maxLeft),
    };
  }, []);

  useEffect(() => {
    if (position.top !== null && position.left !== null) return;
    if (typeof window === 'undefined') return;
    const modal = builderRef.current;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const initialTop = (window.innerHeight - rect.height) / 2;
    const initialLeft = (window.innerWidth - rect.width) / 2;
    setPosition(clampPosition(initialTop, initialLeft));
  }, [clampPosition, position.left, position.top]);

  const markDirty = useCallback(() => {
    setHasChanges(true);
    hasChangesRef.current = true;
  }, []);

  useEffect(() => {
    const inlineSteps = Array.isArray(state?.steps) ? state.steps : [];
    const normalized = inlineSteps.map((step, index) => normalizeEditorStep(step, index));
    const explicitKey =
      typeof state?.pageKey === 'string' && state.pageKey.trim() ? state.pageKey.trim() : '';
    pageKeyTouchedRef.current = Boolean(explicitKey);
    if (explicitKey) {
      setPageKey(explicitKey);
    } else if (!pageKeyTouchedRef.current) {
      setPageKey(fallbackPageKey);
    }
    setPath(state?.path || '');
    setSteps(normalized);
    setSelectedId(normalized[0]?.id || null);
    setHasChanges(false);
    hasChangesRef.current = false;
  }, [fallbackPageKey, pageKeyTouchedRef, state]);

  useEffect(() => {
    if (!state) return undefined;
    const controller = new AbortController();
    setLoading(true);
    ensureTourDefinition({
      pageKey: state.pageKey,
      path: state.path,
      forceReload: true,
      signal: controller.signal,
    })
      .then((entry) => {
        if (!entry || hasChangesRef.current) return;
        const normalized = Array.isArray(entry.steps)
          ? entry.steps.map((step, index) => normalizeEditorStep(step, index))
          : [];
        const entryKey = typeof entry.pageKey === 'string' ? entry.pageKey.trim() : '';
        const stateKey = typeof state.pageKey === 'string' ? state.pageKey.trim() : '';
        const resolvedKey = entryKey || stateKey;
        if (resolvedKey) {
          pageKeyTouchedRef.current = true;
          setPageKey(resolvedKey);
        } else if (!pageKeyTouchedRef.current) {
          setPageKey(fallbackPageKey);
        }
        setPath(entry.path || state.path || '');
        setSteps(normalized);
        setSelectedId((prev) => normalized.find((step) => step.id === prev)?.id || normalized[0]?.id || null);
        setHasChanges(false);
        hasChangesRef.current = false;
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error('Failed to load tour definition', err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ensureTourDefinition, fallbackPageKey, pageKeyTouchedRef, state]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMouseMove = (event) => {
      if (!dragStateRef.current.active) return;
      const nextTop = event.clientY - dragStateRef.current.offsetY;
      const nextLeft = event.clientX - dragStateRef.current.offsetX;
      setPosition(clampPosition(nextTop, nextLeft));
    };

    const stopDragging = () => {
      dragStateRef.current.active = false;
      setDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    const previousUserSelect = typeof document !== 'undefined' ? document.body.style.userSelect : '';
    if (typeof document !== 'undefined') {
      document.addEventListener('mouseleave', stopDragging);
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      if (typeof document !== 'undefined') {
        document.removeEventListener('mouseleave', stopDragging);
        document.body.style.userSelect = previousUserSelect;
      }
    };
  }, [clampPosition, dragging]);

  const highlightElement = useCallback((element) => {
    const current = highlightRef.current;
    if (current.element && current.element !== element && current.element instanceof HTMLElement) {
      current.element.style.outline = current.outline;
      current.element.style.boxShadow = current.boxShadow;
    }
    if (element && element instanceof HTMLElement) {
      highlightRef.current = {
        element,
        outline: element.style.outline,
        boxShadow: element.style.boxShadow,
      };
      element.style.outline = '2px solid #2563eb';
      element.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.25)';
    } else {
      highlightRef.current = { element: null, outline: '', boxShadow: '' };
    }
  }, []);

  const setStepSelectors = useCallback(
    (id, updater) => {
      if (!id) return;
      markDirty();
      setSteps((prev) =>
        prev.map((step) => {
          if (step.id !== id) return step;
          const current = Array.isArray(step.selectors) ? step.selectors : [];
          const nextRaw =
            typeof updater === 'function'
              ? updater(current.slice())
              : Array.isArray(updater)
                ? updater.slice()
                : [];
          const normalized = normalizeSelectorsForState(nextRaw);
          const primary = derivePrimarySelector(normalized);
          return {
            ...step,
            selectors: normalized,
            selector: primary,
            target: primary,
          };
        }),
      );
    },
    [markDirty],
  );

  useEffect(() => {
    if (!picking || typeof document === 'undefined') {
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
      }
      highlightElement(null);
      return undefined;
    }

    const handleMouseMove = (event) => {
      if (builderRef.current?.contains(event.target)) {
        highlightElement(null);
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      highlightElement(target);
    };

    const handleClick = (event) => {
      if (builderRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof HTMLElement ? event.target : null;
      const selector = target ? buildSelector(target) : '';
      const trimmedSelector = selector.trim();
      if (trimmedSelector && selectedId) {
        setStepSelectors(selectedId, (selectors) => {
          if (selectors.some((value) => value.trim() === trimmedSelector)) {
            return selectors;
          }
          return [...selectors, trimmedSelector];
        });
      }
      if (target && typeof target.blur === 'function') {
        const blurTarget = () => target.blur();
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(blurTarget);
        } else {
          blurTarget();
        }
      }
      setPicking(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPicking(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.body.style.cursor = 'crosshair';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.cursor = '';
      highlightElement(null);
    };
  }, [highlightElement, picking, selectedId, setStepSelectors]);

  useEffect(() => {
    if (!selectedId && steps.length) {
      setSelectedId(steps[0].id);
    }
  }, [selectedId, steps]);

  const sortedSteps = useMemo(
    () => steps.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [steps],
  );

  const selectedStep = sortedSteps.find((step) => step.id === selectedId) || null;
  const selectedStepSelectors = Array.isArray(selectedStep?.selectors)
    ? selectedStep.selectors
    : [];

  const handleAddStep = useCallback(() => {
    setSteps((prev) => {
      const nextStep = createEmptyStep(prev.length);
      setSelectedId(nextStep.id);
      markDirty();
      return [...prev, nextStep];
    });
  }, [markDirty]);

  const handleDeleteStep = useCallback(
    (id) => {
      setSteps((prev) => {
        const filtered = prev.filter((step) => step.id !== id);
        const normalized = filtered.map((step, index) => ({ ...step, order: index }));
        if (id === selectedId) {
          setSelectedId(normalized[0]?.id || null);
        }
        return normalized;
      });
      markDirty();
    },
    [markDirty, selectedId],
  );

  const handleMoveStep = useCallback((id, direction) => {
    setSteps((prev) => {
      const index = prev.findIndex((step) => step.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      markDirty();
      return next.map((step, idx) => ({ ...step, order: idx }));
    });
  }, [markDirty]);

  const updateStep = useCallback(
    (id, patch) => {
      markDirty();
      setSteps((prev) =>
        prev.map((step) => {
          if (step.id !== id) return step;
          const next = { ...step, ...patch };
          if (!Array.isArray(next.selectors)) {
            next.selectors = Array.isArray(step.selectors) ? step.selectors.slice() : [];
          }
          if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'selectors')) {
            next.selectors = normalizeSelectorsForState(next.selectors);
          } else if (Object.prototype.hasOwnProperty.call(patch ?? {}, 'selector')) {
            const value = typeof patch.selector === 'string' ? patch.selector : '';
            const base = next.selectors.slice();
            if (base.length) {
              base[0] = value;
            } else if (value) {
              base.push(value);
            } else {
              base.length = 0;
            }
            next.selectors = normalizeSelectorsForState(base);
          } else {
            next.selectors = normalizeSelectorsForState(next.selectors);
          }
          const primary = derivePrimarySelector(next.selectors);
          next.selector = primary;
          next.target = primary;
          return next;
        }),
      );
    },
    [markDirty],
  );

  const handleSave = useCallback(async () => {
    const trimmedKey = pageKey.trim();
    if (!trimmedKey) {
      addToast('Page key is required', 'error');
      return;
    }
    const invalid = steps.some(
      (step) => normalizeSelectorsForPayload(step.selectors).length === 0,
    );
    if (invalid) {
      addToast('Each step must have at least one target selector.', 'error');
      return;
    }
    setSaving(true);
    try {
      const normalized = steps.map((step, index) => {
        const selectors = normalizeSelectorsForPayload(step.selectors);
        const primary = selectors[0] || '';
        return {
          ...step,
          id: step.id,
          order: index,
          selectors,
          selector: primary,
          target: primary,
          content: step.content || '',
          title: step.title || '',
          placement: step.placement || 'bottom',
        };
      });
      const entry = await saveTourDefinition({
        pageKey: trimmedKey,
        path: path.trim() || undefined,
        steps: normalized,
        previousPageKey: state?.mode === 'edit' ? state.pageKey : undefined,
      });
      const updatedSteps = Array.isArray(entry?.steps)
        ? entry.steps.map((step, index) => normalizeEditorStep(step, index))
        : normalized.map((step, index) => normalizeEditorStep(step, index));
      setSteps(updatedSteps);
      setSelectedId((prev) => {
        if (prev && updatedSteps.some((step) => step.id === prev)) return prev;
        return updatedSteps[0]?.id || null;
      });
      const resolvedKey = entry?.pageKey || trimmedKey;
      setPageKey(resolvedKey);
      pageKeyTouchedRef.current = true;
      setPath(entry?.path || path.trim());
      setHasChanges(false);
      hasChangesRef.current = false;
      addToast('Tour saved successfully.', 'success');
    } catch (err) {
      console.error('Failed to save tour definition', err);
      addToast('Failed to save the tour. Please try again.', 'error');
    } finally {
      setSaving(false);
      setPicking(false);
    }
  }, [addToast, pageKey, path, saveTourDefinition, state?.mode, state?.pageKey, steps]);

  const handleDeleteTour = useCallback(async () => {
    if (!state?.pageKey) return;
    if (!window.confirm('Delete this tour?')) return;
    setSaving(true);
    try {
      await deleteTourDefinition(state.pageKey);
      addToast('Tour deleted.', 'success');
      setPicking(false);
      onClose?.();
    } catch (err) {
      console.error('Failed to delete tour definition', err);
      addToast('Failed to delete the tour.', 'error');
    } finally {
      setSaving(false);
    }
  }, [addToast, deleteTourDefinition, onClose, state?.pageKey]);

  const handleClose = useCallback(() => {
    setPicking(false);
    highlightElement(null);
    onClose?.();
  }, [highlightElement, onClose]);

  const saveDisabled =
    saving ||
    loading ||
    !pageKey.trim() ||
    steps.some((step) => normalizeSelectorsForPayload(step.selectors).length === 0);

  const handleHeaderMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement) {
      const interactive = event.target.closest('button, a, input, textarea, select');
      if (interactive) return;
    }
    const modal = builderRef.current;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setDragging(true);
    event.preventDefault();
  }, []);

  return (
    <div
      style={{
        ...styles.overlay,
        ...(picking ? styles.overlayPicking : null),
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          ...styles.modalWrapper,
          top: position.top ?? '50%',
          left: position.left ?? '50%',
          transform: position.top == null || position.left == null ? 'translate(-50%, -50%)' : 'none',
        }}
      >
        <div style={styles.modal} ref={builderRef} className="tour-builder-modal">
          <div style={styles.header} onMouseDown={handleHeaderMouseDown}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                {t('tour_builder_title', 'Tour builder')}
              </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.75 }}>
              {state?.mode === 'edit'
                ? t('tour_builder_edit_mode', 'Edit the guided tour for this page')
                : t('tour_builder_create_mode', 'Create a guided tour for this page')}
            </div>
          </div>
          <button type="button" onClick={handleClose} style={styles.iconButton} aria-label={t('close', 'Close')}>
            ×
          </button>
        </div>
        {loading ? (
          <div style={styles.loading}>{t('tour_builder_loading', 'Loading tour definition…')}</div>
        ) : (
          <div style={styles.body}>
            <div style={styles.sidebar}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>{t('tour_builder_page_key', 'Page key')}</label>
                <input
                  style={styles.input}
                  value={pageKey}
                  onChange={(event) => {
                    setPageKey(event.target.value);
                    if (!pageKeyTouchedRef.current) {
                      pageKeyTouchedRef.current = true;
                    }
                    markDirty();
                  }}
                  placeholder="dashboard"
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>{t('tour_builder_path', 'Path')}</label>
                <input
                  style={styles.input}
                  value={path}
                  onChange={(event) => {
                    setPath(event.target.value);
                    markDirty();
                  }}
                  placeholder="/settings"
                />
              </div>
              <div style={styles.stepsList}>
                {sortedSteps.map((step, index) => {
                  const trimmedSelectors = normalizeSelectorsForPayload(step.selectors);
                  const active = step.id === selectedId;
                  return (
                    <div
                      key={step.id}
                      style={{
                        ...styles.stepCard,
                        ...(active ? styles.stepCardActive : null),
                      }}
                      onClick={() => setSelectedId(step.id)}
                    >
                      <div style={styles.stepHeader}>
                        <span>
                          {t('tour_builder_step_label', 'Step')} {index + 1}
                        </span>
                        <div style={styles.stepActions}>
                          <button
                            type="button"
                            style={{
                              ...styles.tinyButton,
                              ...(index === 0 ? styles.disabledButton : null),
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMoveStep(step.id, 'up');
                            }}
                            disabled={index === 0}
                            aria-label={t('move_up', 'Move up')}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            style={{
                              ...styles.tinyButton,
                              ...(index === sortedSteps.length - 1 ? styles.disabledButton : null),
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMoveStep(step.id, 'down');
                            }}
                            disabled={index === sortedSteps.length - 1}
                            aria-label={t('move_down', 'Move down')}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            style={styles.tinyButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteStep(step.id);
                            }}
                            aria-label={t('delete', 'Delete')}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                      <div style={styles.speechBubble}>
                        <div style={styles.bubbleText}>
                          {step.content ? step.content : t('tour_builder_no_content', 'No content yet')}
                        </div>
                        <div style={styles.bubbleTail} />
                      </div>
                      <div style={styles.selectorPreview}>
                        {trimmedSelectors.length ? (
                          trimmedSelectors.map((selectorValue, selectorIndex) => (
                            <span
                              key={`${step.id}-selector-${selectorIndex}-${selectorValue}`}
                              style={styles.selectorChip}
                            >
                              {selectorValue}
                            </span>
                          ))
                        ) : (
                          <span style={styles.selectorPreviewEmpty}>
                            {t('tour_builder_no_selector', 'No selector assigned')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" style={styles.addStepButton} onClick={handleAddStep}>
                {t('tour_builder_add_step', '＋ Add step')}
              </button>
            </div>
            <div style={styles.editor}>
              {selectedStep ? (
                <div style={styles.editorForm}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>{t('tour_builder_step_title', 'Title (optional)')}</label>
                    <input
                      style={styles.input}
                      value={selectedStep.title}
                      onChange={(event) => updateStep(selectedStep.id, { title: event.target.value })}
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>{t('tour_builder_step_content', 'Speech bubble content')}</label>
                    <textarea
                      style={styles.textarea}
                      value={selectedStep.content}
                      onChange={(event) => updateStep(selectedStep.id, { content: event.target.value })}
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>{t('tour_builder_selector', 'Target selectors')}</label>
                    <div style={styles.selectorList}>
                      {selectedStepSelectors.length ? (
                        selectedStepSelectors.map((selectorValue, selectorIndex) => (
                          <div key={`${selectedStep.id}-selector-${selectorIndex}`} style={styles.selectorItem}>
                            <span style={styles.selectorBadge}>{selectorIndex + 1}</span>
                            <input
                              style={{ ...styles.input, ...styles.selectorInput }}
                              value={selectorValue}
                              onChange={(event) =>
                                setStepSelectors(selectedStep.id, (selectors) => {
                                  const next = selectors.slice();
                                  next[selectorIndex] = event.target.value;
                                  return next;
                                })
                              }
                              placeholder={
                                selectorIndex === 0
                                  ? '#component-id'
                                  : t(
                                      'tour_builder_additional_selector_placeholder',
                                      'Additional selector',
                                    )
                              }
                            />
                            <div style={styles.selectorControls}>
                              <button
                                type="button"
                                style={{
                                  ...styles.selectorControlButton,
                                  ...(selectorIndex === 0 ? styles.disabledButton : null),
                                }}
                                onClick={() =>
                                  setStepSelectors(selectedStep.id, (selectors) => {
                                    if (selectorIndex <= 0) return selectors;
                                    const next = selectors.slice();
                                    const [item] = next.splice(selectorIndex, 1);
                                    next.splice(selectorIndex - 1, 0, item);
                                    return next;
                                  })
                                }
                                disabled={selectorIndex === 0}
                                aria-label={t('move_up', 'Move up')}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                style={{
                                  ...styles.selectorControlButton,
                                  ...(selectorIndex === selectedStepSelectors.length - 1
                                    ? styles.disabledButton
                                    : null),
                                }}
                                onClick={() =>
                                  setStepSelectors(selectedStep.id, (selectors) => {
                                    if (selectorIndex >= selectors.length - 1) return selectors;
                                    const next = selectors.slice();
                                    const [item] = next.splice(selectorIndex, 1);
                                    next.splice(selectorIndex + 1, 0, item);
                                    return next;
                                  })
                                }
                                disabled={selectorIndex === selectedStepSelectors.length - 1}
                                aria-label={t('move_down', 'Move down')}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                style={styles.selectorControlButton}
                                onClick={() =>
                                  setStepSelectors(selectedStep.id, (selectors) =>
                                    selectors.filter((_, idx) => idx !== selectorIndex),
                                  )
                                }
                                aria-label={t('delete', 'Delete')}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={styles.selectorEmpty}>
                          {t(
                            'tour_builder_no_selectors_hint',
                            'No selectors yet. Use “Pick target” or add one manually.',
                          )}
                        </div>
                      )}
                    </div>
                    <div style={styles.selectorActionsRow}>
                      <button
                        type="button"
                        style={styles.pickButton}
                        onClick={() => setPicking(true)}
                        disabled={picking}
                      >
                        {t('tour_builder_pick_target', 'Pick target')}
                      </button>
                      {picking ? (
                        <button
                          type="button"
                          style={styles.cancelPickButton}
                          onClick={() => setPicking(false)}
                        >
                          {t('cancel', 'Cancel')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        style={styles.addSelectorButton}
                        onClick={() =>
                          setStepSelectors(selectedStep.id, (selectors) => [...selectors, ''])
                        }
                      >
                        {t('tour_builder_add_selector', '＋ Add manual selector')}
                      </button>
                    </div>
                    {picking && (
                      <div style={styles.pickerNotice}>
                        {t(
                          'tour_builder_picker_help',
                          'Hover an element and click to append its selector. Press Esc to stop picking.',
                        )}
                      </div>
                    )}
                  </div>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>{t('tour_builder_placement', 'Placement')}</label>
                    <select
                      style={styles.select}
                      value={selectedStep.placement}
                      onChange={(event) => updateStep(selectedStep.id, { placement: event.target.value })}
                    >
                      {placements.map((placement) => (
                        <option key={placement} value={placement}>
                          {placement}
                        </option>
                      ))}
                    </select>
                  </div>
                  {hasChanges && (
                    <div style={styles.unsavedChanges}>
                      {t('tour_builder_unsaved', 'You have unsaved changes.')}
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  {t('tour_builder_empty_state', 'Add a step to start configuring your tour.')}
                </div>
              )}
            </div>
          </div>
        )}
        <div style={styles.footer}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {state?.mode === 'edit' && (
              <button
                type="button"
                style={styles.dangerButton}
                onClick={handleDeleteTour}
                disabled={saving}
              >
                {t('tour_builder_delete', 'Delete tour')}
              </button>
            )}
          </div>
          <div style={styles.footerSpacer} />
          <button type="button" style={styles.secondaryButton} onClick={handleClose}>
            {t('cancel', 'Cancel')}
          </button>
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              ...(saveDisabled ? styles.disabledButton : null),
            }}
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {saving ? t('saving', 'Saving…') : t('save', 'Save')}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    zIndex: 1000,
    padding: '2rem',
  },
  overlayPicking: {
    pointerEvents: 'none',
  },
  modalWrapper: {
    position: 'absolute',
    pointerEvents: 'auto',
  },
  modal: {
    width: 'min(980px, 96vw)',
    maxHeight: '92vh',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 24px 55px rgba(15, 23, 42, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: '#111827',
    color: '#f9fafb',
    cursor: 'move',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    color: '#f9fafb',
    fontSize: '1.5rem',
    cursor: 'pointer',
    lineHeight: 1,
  },
  body: {
    display: 'flex',
    gap: '1.25rem',
    padding: '1.5rem',
    overflow: 'hidden',
    flex: 1,
  },
  sidebar: {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    overflowY: 'auto',
    paddingRight: '0.5rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '0.6rem',
    fontSize: '0.9rem',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    overflowY: 'auto',
    paddingRight: '0.25rem',
  },
  stepCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '0.75rem',
    background: '#f9fafb',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  },
  stepCardActive: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.18)',
    background: '#ffffff',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontWeight: 600,
    color: '#1f2937',
  },
  stepActions: {
    display: 'flex',
    gap: '0.25rem',
  },
  tinyButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: '5px',
    padding: '0.25rem 0.35rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  speechBubble: {
    position: 'relative',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '14px',
    padding: '0.75rem',
    color: '#1f2937',
    fontSize: '0.85rem',
    lineHeight: 1.4,
  },
  bubbleText: {
    minHeight: '2.5rem',
  },
  bubbleTail: {
    position: 'absolute',
    left: '1.5rem',
    bottom: '-0.55rem',
    width: '1.1rem',
    height: '1.1rem',
    background: '#ffffff',
    borderRight: '1px solid #d1d5db',
    borderBottom: '1px solid #d1d5db',
    transform: 'rotate(45deg)',
  },
  selectorPreview: {
    marginTop: '0.6rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.35rem',
  },
  selectorChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.15rem 0.45rem',
    background: '#e0f2fe',
    color: '#1d4ed8',
    borderRadius: '999px',
    fontSize: '0.7rem',
    lineHeight: 1.2,
    maxWidth: '100%',
    wordBreak: 'break-all',
  },
  selectorPreviewEmpty: {
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  selectorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  selectorItem: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-start',
  },
  selectorBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#1d4ed8',
    background: '#e0f2fe',
    borderRadius: '999px',
    padding: '0.2rem 0.5rem',
    lineHeight: 1,
    marginTop: '0.2rem',
  },
  selectorInput: {
    flex: 1,
  },
  selectorControls: {
    display: 'flex',
    gap: '0.25rem',
    flexShrink: 0,
  },
  selectorControlButton: {
    border: '1px solid #d1d5db',
    background: '#fff',
    borderRadius: '6px',
    padding: '0.25rem 0.4rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    lineHeight: 1,
  },
  selectorEmpty: {
    fontSize: '0.8rem',
    color: '#6b7280',
    background: '#f3f4f6',
    borderRadius: '8px',
    padding: '0.75rem',
  },
  selectorActionsRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: '0.5rem',
  },
  addSelectorButton: {
    border: '1px dashed #2563eb',
    background: '#eff6ff',
    color: '#1d4ed8',
    borderRadius: '6px',
    padding: '0.45rem 0.9rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  addStepButton: {
    border: '1px dashed #2563eb',
    borderRadius: '8px',
    padding: '0.6rem',
    background: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 600,
    cursor: 'pointer',
  },
  editor: {
    flex: 1,
    background: '#f3f4f6',
    borderRadius: '12px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  editorForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  textarea: {
    minHeight: '120px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '0.75rem',
    fontSize: '0.9rem',
    resize: 'vertical',
  },
  select: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '0.6rem',
    fontSize: '0.9rem',
  },
  pickerNotice: {
    marginTop: '0.5rem',
    background: '#e0f2fe',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8rem',
    color: '#1e3a8a',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    fontSize: '0.95rem',
    textAlign: 'center',
    padding: '1rem',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  footerSpacer: {
    flex: 1,
  },
  primaryButton: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.65rem 1.5rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '0.65rem 1.4rem',
    cursor: 'pointer',
  },
  dangerButton: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1.2rem',
    cursor: 'pointer',
  },
  pickButton: {
    background: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.45rem 1rem',
    cursor: 'pointer',
  },
  cancelPickButton: {
    background: '#f97316',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '0.45rem 1rem',
    cursor: 'pointer',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#4b5563',
  },
  disabledButton: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  unsavedChanges: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    fontSize: '0.8rem',
  },
};
