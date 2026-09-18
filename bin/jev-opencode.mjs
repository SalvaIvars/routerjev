#!/usr/bin/env node
/**
 * RouterJev - Launcher
 * 
 * Arranca el proxy OpenAI-compatible y lo deja escuchando.
 * El usuario configura su coding agent para usar http://127.0.0.1:PORT
 * con model "routerjev-auto" para routing automático.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { startGoProxy } from "../src/go-proxy.mjs";
import { AUTO_MODEL } from "../src/config.mjs";
import { LOG_FILE } from "../src/log.mjs";

// Cargar .env (precedencia: process env → .env → ~/.jev-router.env)
for (const file of [
  join(process.cwd(), ".env"),
  join(homedir(), ".jev-router.env"),
]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing or unreadable
  }
}

const apiKey = process.env.OPENCODE_GO_API_KEY;
const jevApiKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY;

if (!apiKey) {
  process.stderr.write(
    `[routerjev] No OPENCODE_GO_API_KEY found.\n` +
    `[routerjev] Set it in ${join(homedir(), ".jev-router.env")} or as environment variable.\n` +
    `[routerjev] Get your key at https://opencode.ai/auth\n`
  );
  process.exit(1);
}

if (!jevApiKey) {
  process.stderr.write(
    `[routerjev] No JEV_API_KEY found - starting without intelligent routing.\n` +
    `[routerjev] All requests will use the default model (kimi-k2.7-code).\n` +
    `[routerjev] Set JEV_API_KEY in ${join(homedir(), ".jev-router.env")} to enable routing.\n` +
    `[routerjev] Get your key at https://typesafe.ai\n`
  );
}

const sessionId = `routerjev-${Date.now()}`;

// Si no hay JEV_API_KEY, el proxy arranca pero sin routing (usa modelo por defecto)
const route = jevApiKey ? undefined : async () => null;

const { port, close } = await startGoProxy({ apiKey, sessionId, route });

process.stderr.write(`\n`);
process.stderr.write(`╔══════════════════════════════════════════════════════════╗\n`);
process.stderr.write(`║              RouterJev Proxy Active                     ║\n`);
process.stderr.write(`╠══════════════════════════════════════════════════════════╣\n`);
process.stderr.write(`║                                                          ║\n`);
process.stderr.write(`║  Base URL:  http://127.0.0.1:${String(port).padEnd(5)}                      ║\n`);
process.stderr.write(`║  Model:     ${AUTO_MODEL.padEnd(14)}                             ║\n`);
process.stderr.write(`║  Session:   ${sessionId.slice(0, 20).padEnd(20)}                     ║\n`);
process.stderr.write(`║  Routing:   ${(jevApiKey ? "Enabled (Jev)" : "Disabled (default model)").padEnd(14)}                             ║\n`);
process.stderr.write(`║                                                          ║\n`);
process.stderr.write(`║  Configure your coding agent:                            ║\n`);
process.stderr.write(`║    base_url: http://127.0.0.1:${String(port).padEnd(5)}                     ║\n`);
process.stderr.write(`║    api_key:  ${apiKey.slice(0, 8).padEnd(8)}... (your Go key)                  ║\n`);
process.stderr.write(`║    model:    ${AUTO_MODEL}                                  ║\n`);
process.stderr.write(`║                                                          ║\n`);
process.stderr.write(`║  Press Ctrl+C to stop                                    ║\n`);
process.stderr.write(`║                                                          ║\n`);
process.stderr.write(`╚══════════════════════════════════════════════════════════╝\n`);
process.stderr.write(`\n`);

if (process.env.JEV_DEBUG) {
  process.stderr.write(`[routerjev] Debug log: ${LOG_FILE}\n`);
}

process.on("exit", () => close());

// Mantener vivo
process.stdin.resume();
