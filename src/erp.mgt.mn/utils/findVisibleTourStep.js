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

const CSS_ESCAPE =
  typeof globalThis !== "undefined" &&
  globalThis.CSS &&
  typeof globalThis.CSS.escape === "function"
    ? globalThis.CSS.escape
    : null;

function escapeCssIdentifier(value) {
  if (typeof value !== "string") return "";
  if (CSS_ESCAPE) return CSS_ESCAPE(value);
  return value
    .replace(/\\/g, "\\\\")
    .replace(/(["'#.:;?+<>=~*^$\[\]\(\)\s])/g, "\\$1");
}

function escapeAttributeValue(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function listElementAttributeNames(element) {
  if (!element || typeof element !== "object") return [];
  if (typeof element.getAttributeNames === "function") {
    try {
      const names = element.getAttributeNames();
      return Array.isArray(names) ? names : [];
    } catch (err) {
      return [];
    }
  }

  const attributes = element.attributes;
  if (!attributes || typeof attributes !== "object") return [];
  const result = [];
  for (let idx = 0; idx < attributes.length; idx += 1) {
    const attr = attributes[idx];
    if (!attr || typeof attr.name !== "string") continue;
    result.push(attr.name);
  }
  return result;
}

const PREFERRED_DATA_ATTRIBUTES = [
  "data-testid",
  "data-test",
  "data-tour",
  "data-tour-target",
  "data-qa",
  "data-automation-id",
  "data-id",
];

function deriveElementSegment(element) {
  if (!element || typeof element !== "object") return "";

  const tagName =
    typeof element.tagName === "string" && element.tagName
      ? element.tagName.toLowerCase()
      : "";

  const id = typeof element.id === "string" ? element.id.trim() : "";
  if (id) {
    return `#${escapeCssIdentifier(id)}`;
  }

  const attributeNames = listElementAttributeNames(element);
  if (attributeNames.length) {
    let chosenAttr = "";
    let chosenValue = "";

    const preferredAttr = PREFERRED_DATA_ATTRIBUTES.find((name) =>
      attributeNames.includes(name),
    );
    if (preferredAttr) {
      const preferredValue = element.getAttribute
        ? element.getAttribute(preferredAttr)
        : null;
      if (typeof preferredValue === "string" && preferredValue.trim()) {
        chosenAttr = preferredAttr;
        chosenValue = preferredValue.trim();
      }
    }

    if (!chosenAttr) {
      for (let idx = 0; idx < attributeNames.length; idx += 1) {
        const name = attributeNames[idx];
        if (typeof name !== "string" || !name.startsWith("data-")) continue;
        const value = element.getAttribute ? element.getAttribute(name) : null;
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        chosenAttr = name;
        chosenValue = trimmed;
        break;
      }
    }

    if (chosenAttr && chosenValue) {
      const attrSelector = `[${chosenAttr}="${escapeAttributeValue(chosenValue)}"]`;
      if (tagName) {
        return `${tagName}${attrSelector}`;
      }
      return attrSelector;
    }
  }

  const classList =
    element.classList && typeof element.classList === "object"
      ? Array.from(element.classList)
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
      : [];
  if (classList.length) {
    const limited = classList.slice(0, 3).map((cls) => `.${escapeCssIdentifier(cls)}`);
    const classSelector = limited.join("");
    if (classSelector) {
      if (tagName) {
        return `${tagName}${classSelector}`;
      }
      return classSelector;
    }
  }

  if (tagName) {
    const parent = element.parentElement;
    if (parent && parent.children) {
      const siblings = Array.from(parent.children).filter(
        (child) => child && child.tagName === element.tagName,
      );
      const index = siblings.indexOf(element);
      if (index >= 0) {
        return `${tagName}:nth-of-type(${index + 1})`;
      }
    }
    return tagName;
  }

  return "";
}

function deriveElementSelector(element) {
  if (!element || typeof element !== "object") return "";

  const segments = [];
  let current = element;
  const visited = new Set();
  let depth = 0;
  const MAX_DEPTH = 6;

  while (current && depth < MAX_DEPTH) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);

    const segment = deriveElementSegment(current);
    if (!segment) break;
    segments.unshift(segment);
    if (segment.startsWith("#")) {
      break;
    }
    current = current.parentElement;
    depth += 1;
  }

  return segments.join(" > ");
}

function createFallbackResult(selector, options = {}) {
  const trimmed = typeof selector === "string" ? selector.trim() : "";
  const highlightCandidates = normalizeSelectorList(options.highlightSelectors);
  const highlightSet = new Set();
  if (trimmed) {
    highlightSet.add(trimmed);
  }
  highlightCandidates.forEach((value) => highlightSet.add(value));

  return {
    selector: trimmed,
    highlightSelectors: Array.from(highlightSet),
    derivedFrom: typeof options.derivedFrom === "string" ? options.derivedFrom : "",
  };
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
    return createFallbackResult(resolvedSelector, {
      derivedFrom: "highlight",
    });
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
        return createFallbackResult(parentSelector, {
          derivedFrom: "selector-ancestor",
        });
      }
    } catch (err) {
      // Ignore invalid selectors and continue searching upward.
    }
  }

  if (baseSelector) {
    let baseElement = null;
    try {
      baseElement = querySelector(baseSelector);
    } catch (err) {
      baseElement = null;
    }

    let currentElement = baseElement;
    const visited = new Set();
    let depth = 0;
    const MAX_DEPTH = 10;
    while (currentElement && depth < MAX_DEPTH) {
      if (visited.has(currentElement)) break;
      visited.add(currentElement);

      if (isElementVisible(currentElement)) {
        const derivedSelector = deriveElementSelector(currentElement);
        if (derivedSelector) {
          return createFallbackResult(derivedSelector, {
            derivedFrom:
              currentElement === baseElement ? "target" : "dom-ancestor",
          });
        }
      }

      currentElement = currentElement.parentElement || null;
      depth += 1;
    }

    const ownerDocument =
      baseElement && typeof baseElement === "object"
        ? baseElement.ownerDocument
        : typeof document !== "undefined"
          ? document
          : null;
    if (ownerDocument && ownerDocument.body) {
      const bodyElement = ownerDocument.body;
      if (isElementVisible(bodyElement)) {
        const bodySelector = deriveElementSelector(bodyElement) || "body";
        if (bodySelector) {
          return createFallbackResult(bodySelector, {
            derivedFrom: "document-body",
          });
        }
      }
    }
  }

  if (baseSelector) {
    return createFallbackResult(baseSelector, {
      derivedFrom: "base",
    });
  }

  if (selectorPool.length) {
    return createFallbackResult(selectorPool[0], {
      derivedFrom: "selectors",
    });
  }

  return createFallbackResult("", { derivedFrom: "none" });
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
