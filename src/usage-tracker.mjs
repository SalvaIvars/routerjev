/**
 * Usage Tracker para OpenCode Go
 * 
 * Trackea el consumo de cada modelo individualmente.
 * Cada modelo tiene límites independientes: 5h (20% del mensual), semanal (50%), mensual (100%).
 * Persiste en ~/.jev-router/usage.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getModelInfo } from "./go-models.mjs";

const USAGE_DIR = join(homedir(), ".jev-router");
const USAGE_FILE = join(USAGE_DIR, "usage.json");

export class UsageTracker {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      return JSON.parse(readFileSync(USAGE_FILE, "utf8"));
    } catch {
      return {};
    }
  }

  save() {
    try {
      mkdirSync(USAGE_DIR, { recursive: true });
      writeFileSync(USAGE_FILE, JSON.stringify(this.data, null, 2));
    } catch {
      // Si no podemos guardar, seguimos en memoria
    }
  }

  /**
   * Registra el uso de un modelo después de un request.
   * @param {string} modelId - ID del modelo usado
   * @param {number} inputTokens - Tokens de input del request
   * @param {number} outputTokens - Tokens de output del request
   */
  recordUsage(modelId, inputTokens, outputTokens) {
    const info = getModelInfo(modelId);
    if (!info) return;

    const cost = (inputTokens * info.price.input + outputTokens * info.price.output) / 1_000_000;

    if (!this.data[modelId]) {
      this.data[modelId] = {
        "5h": { used: 0, resetAt: this.getNext5hReset() },
        weekly: { used: 0, resetAt: this.getWeeklyReset() },
        monthly: { used: 0, resetAt: this.getMonthlyReset() },
      };
    }

    const model = this.data[modelId];

    // Reset si pasó el tiempo de la ventana
    if (Date.now() > model["5h"].resetAt) {
      model["5h"] = { used: 0, resetAt: this.getNext5hReset() };
    }
    if (Date.now() > model.weekly.resetAt) {
      model.weekly = { used: 0, resetAt: this.getWeeklyReset() };
    }
    if (Date.now() > model.monthly.resetAt) {
      model.monthly = { used: 0, resetAt: this.getMonthlyReset() };
    }

    model["5h"].used += cost;
    model.weekly.used += cost;
    model.monthly.used += cost;

    this.save();
  }

  /**
   * Verifica si un modelo puede usarse (no ha agotado límites).
   * @param {string} modelId - ID del modelo
   * @returns {boolean} - true si puede usarse
   */
  canUseModel(modelId) {
    const info = getModelInfo(modelId);
    if (!info) return false;

    const model = this.data[modelId];
    if (!model) return true; // Sin uso registrado = disponible

    // Resetear ventanas expiradas antes de verificar
    if (Date.now() > model["5h"].resetAt) {
      model["5h"] = { used: 0, resetAt: this.getNext5hReset() };
    }
    if (Date.now() > model.weekly.resetAt) {
      model.weekly = { used: 0, resetAt: this.getWeeklyReset() };
    }
    if (Date.now() > model.monthly.resetAt) {
      model.monthly = { used: 0, resetAt: this.getMonthlyReset() };
    }

    const limit5h = info.limit * 0.2; // 20% del límite mensual
    const limitWeekly = info.limit * 0.5; // 50% del límite mensual
    const limitMonthly = info.limit; // 100%

    return (
      model["5h"].used < limit5h &&
      model.weekly.used < limitWeekly &&
      model.monthly.used < limitMonthly
    );
  }

  /**
   * Obtiene el ratio de uso de un modelo (0-1) para la ventana de 5h.
   * @param {string} modelId - ID del modelo
   * @returns {number} - Ratio de uso (0 = sin uso, 1 = límite alcanzado)
   */
  getUsageRatio(modelId) {
    const info = getModelInfo(modelId);
    if (!info) return 1;

    const model = this.data[modelId];
    if (!model) return 0;

    // Resetear si expiró
    if (Date.now() > model["5h"].resetAt) {
      model["5h"] = { used: 0, resetAt: this.getNext5hReset() };
    }

    const limit5h = info.limit * 0.2;
    return Math.min(model["5h"].used / limit5h, 1);
  }

  /**
   * Obtiene un resumen del uso de todos los modelos.
   * @returns {Array} - Array de objetos con info de uso
   */
  getUsageSummary() {
    return Object.entries(this.data).map(([modelId, usage]) => {
      const info = getModelInfo(modelId);
      return {
        model: modelId,
        tier: info?.tier || "unknown",
        limit: info?.limit || 0,
        "5h": { ...usage["5h"], limit: (info?.limit || 0) * 0.2 },
        weekly: { ...usage.weekly, limit: (info?.limit || 0) * 0.5 },
        monthly: { ...usage.monthly, limit: info?.limit || 0 },
      };
    });
  }

  /**
   * Calcula el siguiente reset de la ventana de 5h.
   * Las ventanas son: 00:00-05:00, 05:00-10:00, 10:00-15:00, 15:00-20:00, 20:00-00:00 UTC
   */
  getNext5hReset() {
    const now = new Date();
    const hour = now.getUTCHours();
    const nextBlock = Math.ceil((hour + 1) / 5) * 5;
    const reset = new Date(now);
    reset.setUTCHours(nextBlock, 0, 0, 0);
    if (reset <= now) reset.setUTCHours(reset.getUTCHours() + 5);
    return reset.getTime();
  }

  /**
   * Calcula el siguiente reset semanal (lunes 00:00 UTC).
   */
  getWeeklyReset() {
    const now = new Date();
    const day = now.getUTCDay(); // 0 = domingo, 1 = lunes
    const daysUntilMonday = day === 0 ? 1 : (8 - day);
    const reset = new Date(now);
    reset.setUTCDate(now.getUTCDate() + daysUntilMonday);
    reset.setUTCHours(0, 0, 0, 0);
    return reset.getTime();
  }

  /**
   * Calcula el siguiente reset mensual (día 1 del mes, 00:00 UTC).
   */
  getMonthlyReset() {
    const now = new Date();
    const reset = new Date(now);
    reset.setUTCMonth(now.getUTCMonth() + 1, 1);
    reset.setUTCHours(0, 0, 0, 0);
    return reset.getTime();
  }
}

// Instancia singleton
let tracker;
export function getUsageTracker() {
  tracker ??= new UsageTracker();
  return tracker;
}
