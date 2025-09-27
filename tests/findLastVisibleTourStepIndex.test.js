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
  const query = (selector) => selector === "#fallback";

  const result = findVisibleFallbackSelector(step, query);

  assert.equal(result, "#fallback");
});

test("findVisibleFallbackSelector falls back to parent selector", () => {
  const step = {
    target: "#alpha .bravo .charlie",
    highlightSelectors: ["#alpha .bravo .charlie"],
  };
  const query = (selector) => selector === "#alpha .bravo";

  const result = findVisibleFallbackSelector(step, query);

  assert.equal(result, "#alpha .bravo");
});
