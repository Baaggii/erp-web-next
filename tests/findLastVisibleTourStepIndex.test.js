import test from "node:test";
import assert from "node:assert/strict";

import {
  findLastVisibleTourStepIndex,
  findVisibleFallbackSelector,
} from "../src/erp.mgt.mn/utils/findVisibleTourStep.js";

test("findLastVisibleTourStepIndex returns previous visible step", () => {
  const steps = [
    { target: "#alpha" },
    { target: "#bravo" },
    { target: "#charlie" },
  ];
  const query = (selector) => selector === "#bravo";

  const result = findLastVisibleTourStepIndex(steps, 2, query);

  assert.equal(result, 1);
});

test("findLastVisibleTourStepIndex skips invalid selectors", () => {
  const steps = [
    { target: "#one" },
    { target: "#two" },
    { target: "#three" },
  ];
  let calls = 0;
  const query = (selector) => {
    calls += 1;
    if (selector === "#one") return true;
    if (selector === "#two") {
      throw new Error("Invalid selector");
    }
    return false;
  };

  const result = findLastVisibleTourStepIndex(steps, 2, query);

  assert.equal(result, 0);
  assert.equal(calls, 3);
});

test("findLastVisibleTourStepIndex returns -1 when nothing visible", () => {
  const steps = [{ target: "#one" }, { target: "#two" }];
  const query = () => null;

  const result = findLastVisibleTourStepIndex(steps, 1, query);

  assert.equal(result, -1);
});

test("findVisibleFallbackSelector returns first visible highlight selector", () => {
  const step = {
    target: "#missing",
    highlightSelectors: ["#missing", "#fallback", "#other"],
  };
  const elements = {
    "#missing": { offsetParent: null, getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    "#fallback": {
      offsetParent: {},
      getBoundingClientRect: () => ({ width: 10, height: 10 }),
    },
    "#other": null,
  };
  const query = (selector) => elements[selector] || null;

  const result = findVisibleFallbackSelector(step, query);

  assert.equal(result, "#fallback");
});

test("findVisibleFallbackSelector skips hidden targets and pauses on visible parent", () => {
  const step = {
    target: "#alpha .bravo .charlie",
    highlightSelectors: ["#alpha .bravo .charlie", "#alpha .bravo"],
  };
  const elements = {
    "#alpha .bravo .charlie": {
      offsetParent: null,
      offsetWidth: 0,
      offsetHeight: 0,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    },
    "#alpha .bravo": {
      offsetParent: null,
      offsetWidth: 0,
      offsetHeight: 0,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    },
    "#alpha": {
      offsetParent: {},
      offsetWidth: 100,
      offsetHeight: 40,
      getBoundingClientRect: () => ({ width: 100, height: 40 }),
    },
  };
  const query = (selector) => elements[selector] || null;

  const result = findVisibleFallbackSelector(step, query);

  assert.equal(result, "#alpha");
});
