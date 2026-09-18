import test from "node:test";
import assert from "node:assert/strict";
import {
  GO_TIERS,
  getTierForModel,
  getModelsInTier,
  getModelInfo,
  getAllModels,
  getTierNames,
  getModelFormat,
  getEndpointForFormat,
  estimateCost,
} from "../src/go-models.mjs";

test("GO_TIERS has 4 tiers", () => {
  assert.equal(Object.keys(GO_TIERS).length, 4);
  assert.deepEqual(Object.keys(GO_TIERS), ["flash", "standard", "power", "elite"]);
});

test("each tier has at least 4 models", () => {
  for (const [name, tier] of Object.entries(GO_TIERS)) {
    assert(tier.models.length >= 4, `${name} should have at least 4 models, has ${tier.models.length}`);
  }
});

test("getTierForModel returns correct tier", () => {
  assert.equal(getTierForModel("mimo-v2.5"), "flash");
  assert.equal(getTierForModel("kimi-k2.7-code"), "standard");
  assert.equal(getTierForModel("deepseek-v4-pro"), "power");
  assert.equal(getTierForModel("grok-4.6"), "elite");
  assert.equal(getTierForModel("nonexistent"), null);
});

test("getModelsInTier returns models", () => {
  const flash = getModelsInTier("flash");
  assert(flash.length > 0);
  assert(flash.some((m) => m.id === "mimo-v2.5"));
  assert(flash.some((m) => m.id === "hy3"));
});

test("getModelsInTier returns empty for unknown tier", () => {
  assert.deepEqual(getModelsInTier("nonexistent"), []);
});

test("getModelInfo returns complete info", () => {
  const info = getModelInfo("kimi-k2.7-code");
  assert.equal(info.tier, "standard");
  assert.equal(info.price.input, 0.95);
  assert.equal(info.price.output, 4.00);
  assert.equal(info.limit, 60);
  assert.equal(info.format, "chat");
});

test("getModelInfo returns null for unknown model", () => {
  assert.equal(getModelInfo("nonexistent"), null);
});

test("getAllModels returns flat list with tier info", () => {
  const all = getAllModels();
  assert(all.length > 20);
  assert(all.every((m) => m.tier));
  assert(all.every((m) => m.price));
  assert(all.every((m) => m.format));
});

test("getTierNames returns ordered names", () => {
  assert.deepEqual(getTierNames(), ["flash", "standard", "power", "elite"]);
});

test("getModelFormat returns correct format", () => {
  assert.equal(getModelFormat("mimo-v2.5"), "chat");
  assert.equal(getModelFormat("minimax-m3"), "messages");
  assert.equal(getModelFormat("grok-4.6"), "responses");
  assert.equal(getModelFormat("nonexistent"), "chat"); // default
});

test("getEndpointForFormat returns correct paths", () => {
  assert.equal(getEndpointForFormat("chat"), "chat/completions");
  assert.equal(getEndpointForFormat("messages"), "messages");
  assert.equal(getEndpointForFormat("responses"), "responses");
  assert.equal(getEndpointForFormat("unknown"), "chat/completions");
});

test("estimateCost calculates correctly", () => {
  // mimo-v2.5: input $0.14/MTok, output $0.28/MTok
  // 1000 input + 500 output = (1000 * 0.14 + 500 * 0.28) / 1_000_000
  // = (140 + 140) / 1_000_000 = 0.00028
  const cost = estimateCost("mimo-v2.5", 1000, 500);
  assert(Math.abs(cost - 0.00028) < 0.00001);
});

test("estimateCost returns 0 for unknown model", () => {
  assert.equal(estimateCost("nonexistent", 1000, 500), 0);
});

test("all models have valid format", () => {
  const validFormats = ["chat", "messages", "responses"];
  for (const model of getAllModels()) {
    assert(validFormats.includes(model.format), `${model.id} has invalid format: ${model.format}`);
  }
});

test("all models have positive prices", () => {
  for (const model of getAllModels()) {
    assert(model.price.input > 0, `${model.id} has non-positive input price`);
    assert(model.price.output > 0, `${model.id} has non-positive output price`);
  }
});

test("all models have positive limits", () => {
  for (const model of getAllModels()) {
    assert(model.limit > 0, `${model.id} has non-positive limit`);
  }
});
