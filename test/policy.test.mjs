import test from "node:test";
import assert from "node:assert/strict";
import { decide, detectOverride } from "../src/policy.mjs";
import { QUESTIONS, shouldUseExactModel } from "../src/config.mjs";

const ALL = ["flash", "standard", "power", "elite"];
const sure = (choice) => ({ choice, confidence: 0.95 });
const unsure = (choice) => ({ choice, confidence: 0.2 });
const base = { prompt: "refactor the parser", current: "standard", available: ALL };

test("score rubrics contain only API-valid descriptions", () => {
  for (const question of Object.values(QUESTIONS)) {
    if (question.type === "choice") {
      for (const desc of Object.values(question.criteria)) {
        assert(typeof desc === "string" || desc === null);
      }
    }
  }
});

test("follows a confident Jev answer", () => {
  assert.deepEqual(decide({ ...base, jev: sure("power") }), {
    tier: "power",
    reason: "jev",
    changed: true,
  });
});

test("an explicit user override beats Jev", () => {
  const out = decide({ ...base, prompt: "use flash to fix this typo", jev: sure("power") });
  assert.equal(out.tier, "flash");
  assert.equal(out.reason, "override");
});

test("detectOverride only fires on a real instruction", () => {
  assert.equal(detectOverride("use kimi"), "standard");
  assert.equal(detectOverride("use deepseek"), "power");
  assert.equal(detectOverride("use mimo"), "flash");
  assert.equal(detectOverride("the kimi of his career"), null);
});

test("keeps the current model when Jev is unreachable", () => {
  const out = decide({ ...base, jev: null });
  assert.equal(out.tier, "standard");
  assert.equal(out.changed, false);
  assert.match(out.reason, /jev-unavailable/);
});

test("ignores a tier name Jev invented", () => {
  assert.equal(decide({ ...base, jev: sure("gpt-9") }).tier, "standard");
});

test("never downgrades on a low-confidence answer", () => {
  const out = decide({ ...base, jev: unsure("flash") });
  assert.equal(out.tier, "standard");
  assert.match(out.reason, /low-confidence-no-downgrade/);
});

test("caps a low-confidence upgrade at the safe ceiling", () => {
  const out = decide({ ...base, current: "flash", jev: unsure("elite") });
  assert.equal(out.tier, "standard");
  assert.equal(out.reason, "low-confidence-capped");
});

test("still allows a confident upgrade to elite", () => {
  assert.equal(decide({ ...base, jev: sure("elite") }).tier, "elite");
});

test("substitutes upward when the chosen tier is unavailable", () => {
  const out = decide({ ...base, current: "flash", available: ["flash", "power"], jev: sure("standard") });
  assert.equal(out.tier, "power");
  assert.match(out.reason, /unavailable/);
});

test("accepts exact model changes within the same tier", () => {
  assert.equal(shouldUseExactModel("jev/no-change", "power", "power"), true);
  assert.equal(shouldUseExactModel("low-confidence-no-downgrade/no-change", "power", "power"), false);
});

test("no-change reason includes /no-change suffix", () => {
  const out = decide({ ...base, current: "standard", jev: sure("standard") });
  assert.equal(out.tier, "standard");
  assert.equal(out.changed, false);
  assert.match(out.reason, /no-change/);
});
