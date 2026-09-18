import test from "node:test";
import assert from "node:assert/strict";
import { UsageTracker } from "../src/usage-tracker.mjs";

// Usamos una instancia directa (no el singleton) para tests aislados
function createTracker() {
  const tracker = new UsageTracker();
  tracker.data = {}; // Reset para tests
  return tracker;
}

test("canUseModel returns true for unknown model (no usage recorded)", () => {
  const tracker = createTracker();
  assert.equal(tracker.canUseModel("mimo-v2.5"), true);
});

test("canUseModel returns false for unknown model id", () => {
  const tracker = createTracker();
  assert.equal(tracker.canUseModel("nonexistent"), false);
});

test("recordUsage creates entry and tracks cost", () => {
  const tracker = createTracker();
  // mimo-v2.5: input $0.14/MTok, output $0.28/MTok
  tracker.recordUsage("mimo-v2.5", 1_000_000, 1_000_000);
  // Cost = (1_000_000 * 0.14 + 1_000_000 * 0.28) / 1_000_000 = 0.14 + 0.28 = 0.42
  assert(tracker.data["mimo-v2.5"]);
  assert(Math.abs(tracker.data["mimo-v2.5"]["5h"].used - 0.42) < 0.001);
});

test("canUseModel returns false when 5h limit exceeded", () => {
  const tracker = createTracker();
  // mimo-v2.5 limit: $60/month, 5h limit: $12
  // Record enough to exceed 5h limit
  tracker.recordUsage("mimo-v2.5", 50_000_000, 20_000_000);
  // Cost = (50M * 0.14 + 20M * 0.28) / 1M = 7 + 5.6 = 12.6 > 12
  assert.equal(tracker.canUseModel("mimo-v2.5"), false);
});

test("canUseModel returns true when under limit", () => {
  const tracker = createTracker();
  tracker.recordUsage("mimo-v2.5", 1_000_000, 500_000);
  // Cost = (1M * 0.14 + 0.5M * 0.28) / 1M = 0.14 + 0.14 = 0.28 < 12
  assert.equal(tracker.canUseModel("mimo-v2.5"), true);
});

test("getUsageRatio returns 0 for unused model", () => {
  const tracker = createTracker();
  assert.equal(tracker.getUsageRatio("mimo-v2.5"), 0);
});

test("getUsageRatio returns ratio between 0 and 1", () => {
  const tracker = createTracker();
  tracker.recordUsage("mimo-v2.5", 1_000_000, 500_000);
  const ratio = tracker.getUsageRatio("mimo-v2.5");
  assert(ratio > 0 && ratio < 1);
});

test("getUsageRatio returns 1 when limit exceeded", () => {
  const tracker = createTracker();
  tracker.recordUsage("mimo-v2.5", 100_000_000, 50_000_000);
  const ratio = tracker.getUsageRatio("mimo-v2.5");
  assert.equal(ratio, 1);
});

test("getUsageSummary returns array with all tracked models", () => {
  const tracker = createTracker();
  tracker.recordUsage("mimo-v2.5", 1_000_000, 500_000);
  tracker.recordUsage("kimi-k2.7-code", 500_000, 200_000);
  const summary = tracker.getUsageSummary();
  assert.equal(summary.length, 2);
  assert(summary.some((s) => s.model === "mimo-v2.5"));
  assert(summary.some((s) => s.model === "kimi-k2.7-code"));
});

test("getNext5hReset returns future timestamp", () => {
  const tracker = createTracker();
  const reset = tracker.getNext5hReset();
  assert(reset > Date.now());
});

test("getWeeklyReset returns future timestamp", () => {
  const tracker = createTracker();
  const reset = tracker.getWeeklyReset();
  assert(reset > Date.now());
});

test("getMonthlyReset returns future timestamp", () => {
  const tracker = createTracker();
  const reset = tracker.getMonthlyReset();
  assert(reset > Date.now());
});

test("recordUsage ignores unknown model", () => {
  const tracker = createTracker();
  tracker.recordUsage("nonexistent", 1000, 500);
  assert(!tracker.data["nonexistent"]);
});
