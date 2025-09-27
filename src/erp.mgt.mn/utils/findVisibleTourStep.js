export function defaultQuerySelector(selector) {
  if (typeof document === "undefined" || !document?.querySelector) return null;
  return document.querySelector(selector);
}

function normalizeSelectorList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function isElementVisible(element) {
  if (!element || typeof element !== "object") return false;

  let hasDimensions = false;
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
        hasDimensions = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
      }
    } catch (err) {
      // Ignore getBoundingClientRect errors and fall back to other checks.
    }
  }

  if (!hasDimensions) {
    const offsetWidth = typeof element.offsetWidth === "number" ? element.offsetWidth : 0;
    const offsetHeight = typeof element.offsetHeight === "number" ? element.offsetHeight : 0;
    hasDimensions = offsetWidth > 0 && offsetHeight > 0;
  }

  if (hasDimensions) return true;

  if ("offsetParent" in element) {
    return Boolean(element.offsetParent);
  }

  return false;
}

function findExistingSelector(selectors, querySelector) {
  for (let idx = 0; idx < selectors.length; idx += 1) {
    const selector = selectors[idx];
    try {
      const element = querySelector(selector);
      if (isElementVisible(element)) {
        return selector;
      }
    } catch (err) {
      // Ignore invalid selectors while searching for a visible fallback.
    }
  }
  return "";
}

function stripLastSelectorSegment(selector) {
  let current = typeof selector === "string" ? selector.trim() : "";
  if (!current) return "";

  // Remove trailing combinators to simplify subsequent splitting.
  current = current.replace(/[>+~]\s*$/, "").trim();
  if (!current) return "";

  const lastSpace = current.lastIndexOf(" ");
  const lastChild = current.lastIndexOf(">");
  const lastAdjacent = current.lastIndexOf("+");
  const lastGeneral = current.lastIndexOf("~");
  const lastIndex = Math.max(lastSpace, lastChild, lastAdjacent, lastGeneral);

  if (lastIndex === -1) {
    return "";
  }

  const shortened = current.slice(0, lastIndex).trim();
  return shortened.replace(/[>+~]\s*$/, "").trim();
}

export function findVisibleFallbackSelector(
  step,
  querySelector = defaultQuerySelector,
) {
  if (!step || typeof step !== "object") return "";

  const highlightSelectors = normalizeSelectorList(step.highlightSelectors);
  const additionalSelectors = normalizeSelectorList(step.selectors);
  const selectorPool = [...highlightSelectors, ...additionalSelectors];

  const resolvedSelector = findExistingSelector(selectorPool, querySelector);
  if (resolvedSelector) {
    return resolvedSelector;
  }

  const baseSelector =
    typeof step.target === "string" && step.target.trim()
      ? step.target.trim()
      : typeof step.selector === "string" && step.selector.trim()
        ? step.selector.trim()
        : "";

  let parentSelector = baseSelector;
  while (parentSelector) {
    parentSelector = stripLastSelectorSegment(parentSelector);
    if (!parentSelector) break;
    try {
      const element = querySelector(parentSelector);
      if (isElementVisible(element)) {
        return parentSelector;
      }
    } catch (err) {
      // Ignore invalid selectors and continue searching upward.
    }
  }

  return "";
}

export function findLastVisibleTourStepIndex(
  steps,
  startIndex,
  querySelector = defaultQuerySelector,
) {
  if (!Array.isArray(steps) || steps.length === 0) return -1;
  const safeStart = Number.isFinite(startIndex) ? startIndex : steps.length - 1;

  for (let idx = Math.min(safeStart, steps.length - 1); idx >= 0; idx -= 1) {
    const step = steps[idx];
    if (!step || typeof step !== "object") continue;
    const selector =
      typeof step.target === "string" && step.target.trim()
        ? step.target.trim()
        : typeof step.selector === "string" && step.selector.trim()
          ? step.selector.trim()
          : "";
    if (!selector) continue;

    let match = null;
    try {
      match = querySelector(selector);
    } catch (err) {
      // Ignore invalid selectors – they cannot be resolved so we simply skip them.
      match = null;
    }
    if (match) {
      return idx;
    }
  }

  return -1;
}

export default findLastVisibleTourStepIndex;
