import test from "node:test";
import assert from "node:assert/strict";
import { extractPrompt } from "../src/go-proxy.mjs";
import { AUTO_MODEL } from "../src/config.mjs";

test("extractPrompt reads a simple string prompt", () => {
  const body = {
    messages: [
      { role: "user", content: "fix the bug" },
    ],
  };
  assert.equal(extractPrompt(body), "fix the bug");
});

test("extractPrompt reads a text block prompt", () => {
  const body = {
    messages: [
      { role: "user", content: [{ type: "text", text: "fix the bug" }] },
    ],
  };
  assert.equal(extractPrompt(body), "fix the bug");
});

test("extractPrompt returns null for tool_result continuation", () => {
  const body = {
    messages: [
      { role: "user", content: "fix the bug" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] },
    ],
  };
  assert.equal(extractPrompt(body), null);
});

test("extractPrompt returns null for empty messages", () => {
  assert.equal(extractPrompt({ messages: [] }), null);
  assert.equal(extractPrompt({}), null);
  assert.equal(extractPrompt(undefined), null);
});

test("extractPrompt returns null for empty string", () => {
  const body = { messages: [{ role: "user", content: "   " }] };
  assert.equal(extractPrompt(body), null);
});

test("extractPrompt joins multiple text blocks", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "first part" },
          { type: "text", text: "second part" },
        ],
      },
    ],
  };
  assert.equal(extractPrompt(body), "first part\nsecond part");
});

test("AUTO_MODEL is routerjev-auto", () => {
  assert.equal(AUTO_MODEL, "routerjev-auto");
});
