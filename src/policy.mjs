import { TIER_NAMES, THRESHOLDS, OVERRIDE_PATTERNS, rankOf } from "./config.mjs";

/**
 * El tier que el usuario nombró explícitamente en el prompt, o null.
 */
export function detectOverride(prompt) {
  const hit = OVERRIDE_PATTERNS.find((p) => p.re.test(prompt ?? ""));
  return hit ? hit.tier : null;
}

/**
 * Tier más cercano que está disponible. Prefiere subir antes que bajar
 * para no dar silenciosamente un modelo más débil de lo necesario.
 */
function clampToAvailable(tier, available) {
  if (available.includes(tier)) return tier;
  const rank = rankOf(tier);
  const up = TIER_NAMES.filter((t, i) => i > rank && available.includes(t));
  if (up.length) return up[0];
  const down = TIER_NAMES.filter((t, i) => i < rank && available.includes(t));
  return down.length ? down[down.length - 1] : null;
}

/**
 * Convierte la respuesta de Jev en el modelo que vamos a ejecutar.
 * Pura y total: cualquier input faltante o malformado cae al modelo actual.
 *
 * @param {object} input
 * @param {string} input.prompt        prompt crudo del usuario, para detección de override
 * @param {?{choice: string, confidence: number}} input.jev  null cuando Jev falló
 * @param {string} input.current       tier actualmente activo en la sesión
 * @param {string[]} input.available   nombres de tier que se pueden ejecutar
 * @returns {{tier: string, reason: string, changed: boolean}}
 */
export function decide({ prompt, jev, current, available }) {
  const settle = (tier, reason) => {
    const final = clampToAvailable(tier, available) ?? current;
    const why = final === tier ? reason : `${reason}+unavailable`;
    return { tier: final, reason: final === current ? `${why}/no-change` : why, changed: final !== current };
  };

  // Override explícito del usuario gana siempre
  const override = detectOverride(prompt);
  if (override) return settle(override, "override");

  // Jev falló o devolvió algo que no reconocemos
  if (!jev || !TIER_NAMES.includes(jev.choice)) return settle(current, "jev-unavailable");

  let target = jev.choice;

  // Baja confianza: nunca degradar, upgrades capados en uncertainCeiling
  if (jev.confidence < THRESHOLDS.minConfidence) {
    if (rankOf(target) < rankOf(current)) return settle(current, "low-confidence-no-downgrade");
    const ceiling = Math.max(rankOf(current), rankOf(THRESHOLDS.uncertainCeiling));
    if (rankOf(target) > ceiling) return settle(TIER_NAMES[ceiling], "low-confidence-capped");
  }

  // Jev recomendó un tier válido con suficiente confianza
  return settle(target, "jev");
}
