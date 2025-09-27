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

function findExistingSelector(selectors, querySelector) {
  for (let idx = 0; idx < selectors.length; idx += 1) {
    const selector = selectors[idx];
    try {
      if (querySelector(selector)) {
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
      if (querySelector(parentSelector)) {
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
