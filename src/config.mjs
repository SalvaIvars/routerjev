// Toda la configuración del router vive aquí, para que la política completa
// sea revisable en un solo archivo.
import { choice, score, noul } from "@typesafe-ai/sdk";
import { GO_TIERS, getTierNames } from "./go-models.mjs";

/**
 * Tiers de modelos, del más barato al más caro.
 * `id` es el modelo por defecto del tier (el más barato con más límite).
 * `family` es el substring usado para reconocer el tier.
 */
export const TIERS = [
  { name: "flash", id: "mimo-v2.5", family: "flash" },
  { name: "standard", id: "kimi-k2.7-code", family: "standard" },
  { name: "power", id: "deepseek-v4-pro", family: "power" },
  { name: "elite", id: "gpt-5.6-luna", family: "elite" },
];

export const TIER_NAMES = TIERS.map((t) => t.name);

export const rankOf = (name) => TIER_NAMES.indexOf(name);

export const idOf = (name) => TIERS.find((t) => t.name === name)?.id;

export const tierSpec = (name) => TIERS.find((t) => t.name === name);

/**
 * Modelo centinela que indica que este turno debe ser ruteado por Jev.
 * Cuando el cliente envía model: "routerjev-auto", el proxy sabe que
 * debe consultar a Jev para decidir el modelo. Cualquier otro valor
 * significa que el usuario eligió manualmente y se pasa directo.
 */
export const AUTO_MODEL = "routerjev-auto";

/** Si un request debe ser ruteado o pasado directamente. */
export const isAuto = (model) => model === AUTO_MODEL;

/** Tier de un modelo, o null si no lo reconocemos. */
export const tierOf = (model) =>
  TIERS.find((t) => typeof model === "string" && model.includes(t.family))?.name ?? null;

/** Tiers disponibles (todos en Go, no hay opt-in como fable en Claude). */
export const availableTiers = () => TIER_NAMES;

export const THRESHOLDS = {
  /** Por debajo de esta confianza, no degradamos y capamos upgrades. */
  minConfidence: 0.3,
  /** Tier seguro cuando Jev no está seguro. */
  uncertainCeiling: "standard",
  /**
   * Timeout por intento a Jev y deadline total.
   * Medido: ~300-350ms en caliente, ~900-1000ms en frío (TLS handshake).
   */
  jevTimeoutMs: 1500,
  jevDeadlineMs: 3000,
  jevMaxRetries: 1,
};

/**
 * Escala de complejidad para las preguntas de Jev.
 * Simplificada a 5 niveles para mayor precisión.
 */
const COMPLEXITY_SCALE = [
  "Trivial",
  "Low",
  "Moderate",
  "High",
  "Extreme",
];

export const COMPLEXITY_MAX_SCORE = COMPLEXITY_SCALE.length - 1;

/**
 * Patrones de override explícito del usuario.
 * Si el prompt contiene "usa deepseek" o similar, gana sobre Jev.
 */
export const OVERRIDE_PATTERNS = [
  { tier: "flash", re: /\b(?:use|switch to|with|on)\s+(?:flash|mimo|mi\s*mo|hy3|hy-3)\b/i },
  { tier: "standard", re: /\b(?:use|switch to|with|on)\s+(?:standard|kimi|minimax|qwen|longcat)\b/i },
  { tier: "power", re: /\b(?:use|switch to|with|on)\s+(?:power|deepseek|grok|gpt)\b/i },
  { tier: "elite", re: /\b(?:use|switch to|with|on)\s+(?:elite|strong|grok|gpt-5)\b/i },
];

/**
 * Preguntas para Jev.
 * 
 * Usamos 1 Choice (tier) + 2 Nouls en vez de 3 Scores de 10 niveles.
 * Más simple, más preciso, más barato.
 */
export const QUESTIONS = {
  model_tier: choice(
    "Which model tier is appropriate for this coding task?",
    {
      flash: "Simple edits, formatting, single-file trivial fixes, rename/refactor, comments, documentation updates",
      standard: "Normal coding, multi-file edits, standard debugging, feature additions, test writing, code review",
      power: "Complex reasoning, architecture decisions, hard multi-file debugging, performance optimization, security analysis",
      elite: "System design, critical infrastructure code, complex algorithms, concurrency issues, large-scale migrations"
    }
  ),
  needs_reasoning: noul(
    "Does this task require multi-step reasoning or understanding complex logic?"
  ),
  is_mechanical: noul(
    "Is this a purely mechanical task (formatting, renaming, simple find-replace)?"
  ),
};

/**
 * Guidance para cada tier (qué va y qué no va).
 * Se usa cuando pasamos los modelos individuales a Jev.
 */
const GUIDANCE = {
  flash: {
    what: "Trivial, mechanical, or purely factual work.",
    signals: ["Rename, reformat, comment, or run one obvious command"],
    not_for: "Design judgement or multi-file reasoning.",
  },
  standard: {
    what: "Ordinary day-to-day engineering with a clear, bounded shape.",
    signals: ["Implement a specified function, test existing behaviour, or fix an understood local bug"],
    not_for: "Open-ended architecture, subtle concurrency, or unknown-cause debugging.",
  },
  power: {
    what: "Hard reasoning, ambiguity, or high blast radius.",
    signals: ["Unknown-cause debugging, cross-module design, security, auth, concurrency, or migrations"],
    not_for: "Routine work with a clear implementation.",
  },
  elite: {
    what: "Very large or long-running work beyond a normal focused session.",
    signals: ["Whole-repo migration, unusually large context, or multi-hour autonomous execution"],
    not_for: "Anything a strong model can finish in one focused session.",
  }
};

/**
 * Construye la pregunta Choice con los modelos individuales disponibles.
 * Se usa cuando queremos que Jev elija el modelo exacto, no solo el tier.
 */
export const questionForModels = (models) =>
  choice(
    [
      "Pick the cheapest exact model that can fully complete this coding request in one pass.",
      "Treat different model versions as separate choices. Judge required reasoning, not requested reply length.",
    ],
    Object.fromEntries(
      models.map(({ id, tier, description }) => [
        id,
        { model: description ?? id, ...GUIDANCE[tier] },
      ]),
    ),
  );

/** Si la policy aceptó el modelo exacto de Jev. */
export const shouldUseExactModel = (reason, chosenTier, finalTier) =>
  (reason === "jev" || reason === "jev/no-change") && chosenTier === finalTier;
