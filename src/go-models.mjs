/**
 * Registry de modelos de OpenCode Go
 * 
 * Los modelos están agrupados en 4 tiers por capacidad/coste:
 * - flash: Tareas simples, formato, cambios triviales (muy barato)
 * - standard: Coding normal, multi-archivo, debugging estándar (barato)
 * - power: Razonamiento complejo, arquitectura, bugs difíciles (medio)
 * - elite: Tareas muy complejas, diseño de sistemas, código crítico (caro)
 * 
 * Cada modelo tiene:
 * - id: identificador para la API de Go
 * - price: { input: $/MTok, output: $/MTok }
 * - limit: límite mensual en dólares
 * - format: formato de API que usa (chat/messages/responses)
 */

export const GO_TIERS = {
  flash: {
    name: "flash",
    description: "Tareas simples, formato, cambios triviales",
    models: [
      { id: "mimo-v2.5", price: { input: 0.14, output: 0.28 }, limit: 60, format: "chat" },
      { id: "muse-spark-1.3-contributor", price: { input: 0.10, output: 0.20 }, limit: 60, format: "responses" },
      { id: "glm-5.3-flash", price: { input: 0.15, output: 0.50 }, limit: 60, format: "chat" },
      { id: "deepseek-v4-flash", price: { input: 0.15, output: 0.60 }, limit: 30, format: "chat" },
      { id: "qwen3.8-flash", price: { input: 0.15, output: 0.47 }, limit: 30, format: "messages" },
      { id: "hy3", price: { input: 0.14, output: 0.58 }, limit: 60, format: "chat" },
    ]
  },
  standard: {
    name: "standard",
    description: "Coding normal, multi-archivo, debugging estándar",
    models: [
      { id: "kimi-k2.7-code", price: { input: 0.95, output: 4.00 }, limit: 60, format: "chat" },
      { id: "kimi-k2.6", price: { input: 0.95, output: 4.00 }, limit: 60, format: "chat" },
      { id: "minimax-m3", price: { input: 0.30, output: 1.20 }, limit: 60, format: "messages" },
      { id: "minimax-m2.7", price: { input: 0.30, output: 1.20 }, limit: 60, format: "messages" },
      { id: "qwen3.7-plus", price: { input: 0.40, output: 1.60 }, limit: 60, format: "messages" },
      { id: "qwen3.6-plus", price: { input: 0.50, output: 3.00 }, limit: 60, format: "messages" },
      { id: "longcat-2.0", price: { input: 0.30, output: 1.20 }, limit: 60, format: "chat" },
    ]
  },
  power: {
    name: "power",
    description: "Razonamiento complejo, arquitectura, bugs difíciles",
    models: [
      { id: "deepseek-v4-pro", price: { input: 0.66, output: 1.98 }, limit: 15, format: "chat" },
      { id: "qwen3.8-max", price: { input: 2.00, output: 6.00 }, limit: 15, format: "messages" },
      { id: "qwen3.7-max", price: { input: 2.50, output: 7.50 }, limit: 30, format: "messages" },
      { id: "kimi-k3", price: { input: 3.00, output: 15.00 }, limit: 15, format: "chat" },
      { id: "mimo-v2.5-pro", price: { input: 0.435, output: 0.87 }, limit: 15, format: "chat" },
      { id: "hy4-preview", price: { input: 0.834, output: 2.501 }, limit: 30, format: "chat" },
      { id: "glm-5.3", price: { input: 1.40, output: 4.40 }, limit: 15, format: "chat" },
    ]
  },
  elite: {
    name: "elite",
    description: "Tareas muy complejas, diseño de sistemas, código crítico",
    models: [
      { id: "grok-4.6", price: { input: 2.00, output: 6.00 }, limit: 15, format: "responses" },
      { id: "gpt-5.6-luna", price: { input: 0.20, output: 1.20 }, limit: 15, format: "responses" },
      { id: "deepseek-v4.1-flash", price: { input: 0.15, output: 0.60 }, limit: 60, format: "chat" },
      { id: "deepseek-v4-flash-vision-exp", price: { input: 0.15, output: 0.60 }, limit: 15, format: "chat" },
    ]
  }
};

// Lista plana de todos los modelos para acceso rápido
const ALL_MODELS = Object.values(GO_TIERS).flatMap(tier =>
  tier.models.map(m => ({ ...m, tier: tier.name }))
);

/**
 * Obtiene el tier de un modelo por su ID
 * @param {string} modelId - ID del modelo (ej: "kimi-k2.7-code")
 * @returns {string|null} - Nombre del tier o null si no existe
 */
export function getTierForModel(modelId) {
  for (const [tierName, tier] of Object.entries(GO_TIERS)) {
    if (tier.models.some(m => m.id === modelId)) {
      return tierName;
    }
  }
  return null;
}

/**
 * Obtiene todos los modelos de un tier
 * @param {string} tierName - Nombre del tier
 * @returns {Array} - Array de modelos del tier
 */
export function getModelsInTier(tierName) {
  return GO_TIERS[tierName]?.models || [];
}

/**
 * Obtiene información completa de un modelo
 * @param {string} modelId - ID del modelo
 * @returns {Object|null} - Info del modelo con tier incluido, o null
 */
export function getModelInfo(modelId) {
  return ALL_MODELS.find(m => m.id === modelId) || null;
}

/**
 * Obtiene todos los modelos con su tier
 * @returns {Array} - Array de todos los modelos
 */
export function getAllModels() {
  return ALL_MODELS;
}

/**
 * Obtiene los nombres de todos los tiers
 * @returns {string[]} - Array de nombres de tiers
 */
export function getTierNames() {
  return Object.keys(GO_TIERS);
}

/**
 * Obtiene el formato de API que usa un modelo
 * @param {string} modelId - ID del modelo
 * @returns {string} - "chat" | "messages" | "responses"
 */
export function getModelFormat(modelId) {
  const model = getModelInfo(modelId);
  return model?.format || "chat";
}

/**
 * Obtiene el endpoint de Go para un formato
 * @param {string} format - Formato del modelo
 * @returns {string} - Path del endpoint
 */
export function getEndpointForFormat(format) {
  switch (format) {
    case "chat": return "chat/completions";
    case "messages": return "messages";
    case "responses": return "responses";
    default: return "chat/completions";
  }
}

/**
 * Calcula el coste estimado de un request
 * @param {string} modelId - ID del modelo
 * @param {number} inputTokens - Tokens de input
 * @param {number} outputTokens - Tokens de output
 * @returns {number} - Coste en dólares
 */
export function estimateCost(modelId, inputTokens, outputTokens) {
  const model = getModelInfo(modelId);
  if (!model) return 0;
  return (inputTokens * model.price.input + outputTokens * model.price.output) / 1_000_000;
}
