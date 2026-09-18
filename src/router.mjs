import { TypeSafeClient } from "@typesafe-ai/sdk";
import { QUESTIONS, questionForModels, THRESHOLDS } from "./config.mjs";
import { log } from "./log.mjs";

// El cliente se construye lazy porque el constructor lanza si no hay key,
// y una key faltante debe degradar a "sin routing", no detener la sesión.
let client;
function getClient() {
  client ??= new TypeSafeClient({
    apiKey: process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY,
    timeout: THRESHOLDS.jevTimeoutMs,
    retry: { maxRetries: THRESHOLDS.jevMaxRetries, backoffInitialMs: 150, backoffMaxMs: 400 },
    logLevel: "warn", // nunca "debug": los request bodies contienen el prompt del usuario
  });
  return client;
}

/**
 * Pregunta a Jev qué tier usar para este prompt.
 * Devuelve null en cualquier fallo, que la policy lee como "mantener modelo actual".
 * El routing nunca debe bloquear un prompt.
 *
 * @returns {Promise<?{choice: string, confidence: number, probabilities: object, ms: number}>}
 */
export async function askJev({ prompt, current, models }) {
  if (!models?.length) return null;
  const started = Date.now();
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), THRESHOLDS.jevDeadlineMs);
  const request = {
    state: {
      request: prompt,
      session: { current_model: current },
      environment: { available_models: models.map((model) => model.id) },
    },
    questions: { ...QUESTIONS },
    model: "jev-latest",
  };
  try {
    const result = await getClient().systemOne(request, { signal: abort.signal });
    const { model_tier, needs_reasoning, is_mechanical } = result.answers;
    return {
      ...model_tier,
      request,
      response: result,
      metrics: {
        needsReasoning: needs_reasoning.noul,
        isMechanical: is_mechanical.noul,
      },
      ms: Date.now() - started,
    };
  } catch (err) {
    log(`routing failed, keeping ${current}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(deadline);
  }
}
