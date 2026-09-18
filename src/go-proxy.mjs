/**
 * Proxy OpenAI-compatible para OpenCode Go
 * 
 * Expone un endpoint local que cualquier coding agent puede usar
 * y forward a la API de Go, ruteando inteligentemente con Jev.
 */

import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import {
  GO_TIERS,
  getAllModels,
  getModelsInTier,
  getModelInfo,
  getModelFormat,
  getEndpointForFormat,
  getTierForModel,
} from "./go-models.mjs";
import { askJev } from "./router.mjs";
import { decide } from "./policy.mjs";
import { AUTO_MODEL, availableTiers } from "./config.mjs";
import { getUsageTracker } from "./usage-tracker.mjs";
import { log } from "./log.mjs";

const GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const debug = (line) => process.env.JEV_DEBUG && log(line);

/**
 * Store de decisiones de routing en memoria.
 * Guarda las últimas MAX_DECISIONS para poder consultarlas via /stats.
 */
const MAX_DECISIONS = 50;
const decisions = [];

export function recordDecision(decision) {
  decisions.push({ ...decision, at: Date.now() });
  if (decisions.length > MAX_DECISIONS) decisions.shift();
}

export function getDecisions() {
  return [...decisions];
}

/**
 * Extrae el texto del último mensaje de usuario.
 * Devuelve null si no es un turno nuevo (tool_result, assistant, etc.)
 */
export function extractPrompt(body) {
  const messages = body?.messages || [];
  if (!messages.length) return null;

  // Buscar el último mensaje de usuario
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    // Si es un tool_result, no es un turno nuevo
    if (Array.isArray(msg.content)) {
      if (msg.content.some((b) => b.type === "tool_result" || b.type === "tool_use")) {
        return null;
      }
      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || null;
    }

    if (typeof msg.content === "string") {
      return msg.content.trim() || null;
    }
  }
  return null;
}

/**
 * Selecciona el mejor modelo dentro de un tier, considerando uso restante.
 */
function selectModelInTier(tierName) {
  const tier = GO_TIERS[tierName];
  if (!tier || !tier.models.length) return "kimi-k2.7-code";

  const tracker = getUsageTracker();

  // Filtrar modelos que no hayan agotado límites
  const available = tier.models.filter((m) => tracker.canUseModel(m.id));

  if (available.length === 0) {
    // Todos agotaron límites, usar el de menor uso relativo
    return tier.models.reduce((min, m) => {
      const usage = tracker.getUsageRatio(m.id);
      const minUsage = tracker.getUsageRatio(min.id);
      return usage < minUsage ? m : min;
    }).id;
  }

  // Elegir el de menor uso en las últimas 5h
  return available.reduce((min, m) => {
    const usage = tracker.getUsageRatio(m.id);
    const minUsage = tracker.getUsageRatio(min.id);
    return usage < minUsage ? m : min;
  }).id;
}

/**
 * Construye la lista de modelos para Jev, con info de tier y descripción.
 */
function getAllModelsForJev() {
  return getAllModels().map((m) => ({
    id: m.id,
    tier: m.tier,
    description: `${m.id} (${m.tier} tier)`,
  }));
}

/**
 * Traduce un request de formato OpenAI chat al formato que Go necesita.
 * Por ahora Go acepta OpenAI-compatible directamente, pero preparamos
 * la traducción para los otros formatos.
 */
function translateRequest(body, format) {
  // OpenAI chat format es el base
  // Los otros formatos (messages, responses) son muy similares
  // por ahora pasamos el body tal cual
  return body;
}

/**
 * Traduce una respuesta de Go al formato OpenAI chat.
 */
function translateResponse(data, format) {
  // Si Go devuelve formato OpenAI-compatible, no hay que traducir
  // Si devuelve otro formato, aquí haríamos la traducción
  return data;
}

/**
 * Forward un request a la API de Go.
 */
async function forwardToGo(body, apiKey, sessionId) {
  const modelId = body.model;
  const format = getModelFormat(modelId);
  const endpoint = getEndpointForFormat(format);
  const url = `${GO_BASE_URL}/${endpoint}`;

  const translatedBody = translateRequest(body, format);

  const target = new URL(url);
  const transport = target.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: target.hostname,
        port: target.port || undefined,
        path: target.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "user-agent": "routerjev/1.0",
          "x-opencode-session": sessionId || `routerjev-${randomUUID()}`,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString();
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, data: json, headers: res.headers });
          } catch {
            resolve({ status: res.statusCode, data: { error: { message: data } }, headers: res.headers });
          }
        });
      }
    );

    req.on("error", reject);
    req.write(JSON.stringify(translatedBody));
    req.end();
  });
}

/**
 * Arranca el proxy OpenAI-compatible.
 * 
 * @param {object} options
 * @param {string} options.apiKey - API key de OpenCode Go
 * @param {string} options.sessionId - ID de sesión para Go
 * @param {function} options.route - Función de routing (default: askJev)
 * @returns {Promise<{port: number, close: function}>}
 */
export async function startGoProxy({ apiKey, sessionId, route = askJev } = {}) {
  const convos = new Map(); // Estado por conversación
  const tracker = getUsageTracker();

  const stateFor = (key) => {
    let s = convos.get(key);
    if (!s) {
      if (convos.size > 50) convos.delete(convos.keys().next().value);
      convos.set(key, (s = { tier: null, model: null }));
    }
    return s;
  };

  const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      });
      return res.end();
    }

    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    }

    // Stats endpoint — últimas decisiones + uso por modelo
    if (req.method === "GET" && req.url === "/stats") {
      const recentDecisions = getDecisions().slice(-20).reverse();
      const usageSummary = tracker.getUsageSummary();
      const stats = {
        uptime: process.uptime(),
        totalDecisions: decisions.length,
        decisions: recentDecisions,
        usage: usageSummary,
      };
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      return res.end(JSON.stringify(stats, null, 2));
    }

    // HEAD probe (algunos clientes probean antes de usar)
    if (req.method === "HEAD") {
      return res.writeHead(200).end();
    }

    // List models
    if (req.method === "GET" && /^\/v1\/models(?:\?|$)/.test(req.url ?? "")) {
      const models = getAllModels().map((m) => ({
        id: m.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "opencode-go",
      }));
      // Añadir el modelo centinela
      models.unshift({
        id: AUTO_MODEL,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "routerjev",
      });
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      return res.end(JSON.stringify({ object: "list", data: models }));
    }

    // Chat completions (el endpoint principal)
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());

          // ¿Es auto-routing?
          if (body.model === AUTO_MODEL) {
            const prompt = extractPrompt(body);

            if (prompt) {
              // Generar conversation key
              const key = `${sessionId || "default"}|${body.messages?.[0]?.content?.slice(0, 50) || ""}`;
              const state = stateFor(key);
              const current = state.tier ?? "standard";

              // Preguntar a Jev
              const models = getAllModelsForJev().filter((m) =>
                availableTiers().includes(m.tier)
              );
              const jev = await route({ prompt, current, models });

              // Decidir tier
              const chosen = jev && models.find((m) => m.id === jev.choice);
              const tierAnswer = jev && { ...jev, choice: chosen?.tier };
              const { tier, reason } = decide({
                prompt,
                jev: tierAnswer,
                current,
                available: availableTiers(),
              });

              // Seleccionar modelo específico dentro del tier
              const model = selectModelInTier(tier);
              state.tier = tier;
              state.model = model;
              body.model = model;

              // Guardar decisión para /stats
              recordDecision({
                prompt: prompt.slice(0, 100),
                tier,
                model,
                confidence: jev?.confidence ?? null,
                reason,
                jevMs: jev?.ms ?? null,
                needsReasoning: jev?.metrics?.needsReasoning ?? null,
                isMechanical: jev?.metrics?.isMechanical ?? null,
              });

              // Log visible a stderr (una línea concisa)
              const confStr = jev?.confidence != null ? `${Math.round(jev.confidence * 100)}%` : "n/a";
              const jevStr = jev ? `${jev.ms}ms` : "no-jev";
              process.stderr.write(
                `\x1b[90m[routerjev]\x1b[0m \x1b[36m${tier}\x1b[0m → \x1b[1m${model}\x1b[0m ` +
                `(conf: ${confStr}, ${jevStr}, ${reason})\n`
              );

              debug(
                `${key.slice(0, 12)} ${jev ? `${jev.ms}ms p=${jev.confidence?.toFixed(2)}` : "no-jev"} ` +
                  `${current} -> ${tier} (${reason}) -> ${model} | ${prompt.slice(0, 60)}`
              );
            } else {
              // No es turno nuevo, usar el tier de la conversación
              const key = `${sessionId || "default"}|${body.messages?.[0]?.content?.slice(0, 50) || ""}`;
              const state = stateFor(key);
              body.model = state.model ?? selectModelInTier("standard");
            }
          }

          // Forward a Go
          const result = await forwardToGo(body, apiKey, sessionId);

          // Registrar uso
          const inputTokens = result.data?.usage?.prompt_tokens || 0;
          const outputTokens = result.data?.usage?.completion_tokens || 0;
          tracker.recordUsage(body.model, inputTokens, outputTokens);

          // Traducir respuesta si es necesario
          const response = translateResponse(result.data, getModelFormat(body.model));

          res.writeHead(result.status, {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          });
          res.end(JSON.stringify(response));
        } catch (err) {
          debug(`error: ${err.message}`);
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: err.message, type: "proxy_error" } }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Not found" } }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, close: () => server.close() };
}
