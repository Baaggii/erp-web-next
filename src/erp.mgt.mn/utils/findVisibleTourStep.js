export function defaultQuerySelector(selector) {
  if (typeof document === "undefined" || !document?.querySelector) return null;
  return document.querySelector(selector);
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
