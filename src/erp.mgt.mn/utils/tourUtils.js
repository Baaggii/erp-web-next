export function normalizeTourSteps(steps) {
  if (!Array.isArray(steps)) return [];

  return steps
    .map((step) => {
      if (!step || typeof step !== 'object') return null;
      const target = step.target ?? step.selector;
      if (!target) return null;
      return { ...step, target };
    })
    .filter(Boolean);
}

export function findMissingTourTargets(steps, querySelector) {
  const selectorFn =
    querySelector ||
    (typeof document !== 'undefined' && document?.querySelector
      ? document.querySelector.bind(document)
      : null);

  if (!selectorFn) return [];

  const missing = [];

  for (const step of steps) {
    if (!step || typeof step.target !== 'string') continue;
    const target = step.target.trim();
    if (!target || target === 'body' || target === 'window') continue;
    if (!selectorFn(target) && !missing.includes(target)) {
      missing.push(target);
    }
  }

  return missing;
}
