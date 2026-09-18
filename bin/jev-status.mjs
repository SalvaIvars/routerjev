#!/usr/bin/env node
/**
 * RouterJev Status CLI
 * 
 * Muestra las últimas decisiones de routing y el uso por modelo.
 * Consulta el endpoint /stats del proxy.
 * 
 * Uso:
 *   node bin/jev-status.mjs              # puerto por defecto 3000
 *   node bin/jev-status.mjs --port 8080  # puerto específico
 *   ROUTERJEV_URL=http://... node bin/jev-status.mjs
 */

import { homedir } from "node:os";
import { join } from "node:path";

// Cargar .env
for (const file of [
  join(process.cwd(), ".env"),
  join(homedir(), ".jev-router.env"),
]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing
  }
}

// Parsear args
const args = process.argv.slice(2);
let port = 3000;
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  port = parseInt(args[portIdx + 1], 10);
}

const baseUrl = process.env.ROUTERJEV_URL || `http://127.0.0.1:${port}`;

try {
  const res = await fetch(`${baseUrl}/stats`);
  if (!res.ok) {
    console.error(`[routerjev] Proxy returned ${res.status}. Is it running at ${baseUrl}?`);
    process.exit(1);
  }

  const stats = await res.json();

  // Header
  const uptimeMin = Math.floor(stats.uptime / 60);
  const uptimeHr = Math.floor(uptimeMin / 60);
  const uptimeStr = uptimeHr > 0
    ? `${uptimeHr}h ${uptimeMin % 60}m`
    : `${uptimeMin}m`;

  console.log();
  console.log(`\x1b[1m╔══════════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[1m║              RouterJev Status                             ║\x1b[0m`);
  console.log(`\x1b[1m╠══════════════════════════════════════════════════════════╣\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  Uptime:           ${uptimeStr.padEnd(42)}\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m║\x1b[0m  Total decisions:  ${String(stats.totalDecisions).padEnd(42)}\x1b[1m║\x1b[0m`);
  console.log(`\x1b[1m╚══════════════════════════════════════════════════════════╝\x1b[0m`);

  // Últimas decisiones
  if (stats.decisions.length > 0) {
    console.log();
    console.log(`\x1b[1m  Recent decisions:\x1b[0m`);
    console.log(`  \x1b[90m─────────────────────────────────────────────────────────────\x1b[0m`);

    for (const d of stats.decisions) {
      const time = new Date(d.at).toLocaleTimeString();
      const conf = d.confidence != null ? `${Math.round(d.confidence * 100)}%` : "n/a ";
      const confColor = d.confidence >= 0.7 ? "\x1b[32m" : d.confidence >= 0.4 ? "\x1b[33m" : "\x1b[31m";
      const tierColor = {
        flash: "\x1b[90m",
        standard: "\x1b[36m",
        power: "\x1b[35m",
        elite: "\x1b[31m",
      }[d.tier] || "\x1b[37m";

      console.log(
        `  \x1b[90m${time}\x1b[0m  ${tierColor}${d.tier.padEnd(8)}\x1b[0m → \x1b[1m${d.model.padEnd(28)}\x1b[0m ` +
        `${confColor}conf: ${conf}\x1b[0m  \x1b[90m${d.jevMs != null ? d.jevMs + "ms" : "no-jev"}\x1b[0m`
      );
      if (d.prompt) {
        const promptPreview = d.prompt.length > 55 ? d.prompt.slice(0, 52) + "..." : d.prompt;
        console.log(`           \x1b[90m"${promptPreview}"\x1b[0m`);
      }
    }
  } else {
    console.log();
    console.log(`  \x1b[90mNo decisions yet. Send a request with model "routerjev-auto" to see routing.\x1b[0m`);
  }

  // Uso por modelo
  if (stats.usage.length > 0) {
    console.log();
    console.log(`\x1b[1m  Usage (5h window):\x1b[0m`);
    console.log(`  \x1b[90m─────────────────────────────────────────────────────────────\x1b[0m`);

    // Ordenar por tier y luego por uso
    const tierOrder = { flash: 0, standard: 1, power: 2, elite: 3 };
    const sorted = [...stats.usage].sort((a, b) => {
      const ta = tierOrder[a.tier] ?? 99;
      const tb = tierOrder[b.tier] ?? 99;
      if (ta !== tb) return ta - tb;
      return (b["5h"]?.used || 0) - (a["5h"]?.used || 0);
    });

    for (const u of sorted) {
      const used5h = u["5h"]?.used || 0;
      const limit5h = u["5h"]?.limit || 1;
      const ratio = Math.min(used5h / limit5h, 1);
      const barLen = 20;
      const filled = Math.round(ratio * barLen);
      const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

      const barColor = ratio > 0.8 ? "\x1b[31m" : ratio > 0.5 ? "\x1b[33m" : "\x1b[32m";
      const tierColor = {
        flash: "\x1b[90m",
        standard: "\x1b[36m",
        power: "\x1b[35m",
        elite: "\x1b[31m",
      }[u.tier] || "\x1b[37m";

      console.log(
        `  ${tierColor}${u.tier.padEnd(8)}\x1b[0m \x1b[90m${u.model.padEnd(28)}\x1b[0m ` +
        `${barColor}${bar}\x1b[0m \x1b[90m$${used5h.toFixed(2)}/$${limit5h.toFixed(0)}\x1b[0m`
      );
    }
  }

  console.log();
} catch (err) {
  console.error(`[routerjev] Could not connect to proxy at ${baseUrl}`);
  console.error(`[routerjev] ${err.message}`);
  console.error(`[routerjev] Make sure RouterJev is running: node bin/jev-opencode.mjs`);
  process.exit(1);
}
