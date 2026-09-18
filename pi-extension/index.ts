import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Extensión de Pi para RouterJev
 * 
 * Registra RouterJev como un provider custom que apunta al proxy local.
 * Fetch dinámico de modelos desde /v1/models del proxy.
 */
export default async function (pi: ExtensionAPI) {
  const baseUrl = process.env.ROUTERJEV_URL || "http://127.0.0.1:3000";
  const apiKey = process.env.OPENCODE_GO_API_KEY || "routerjev";

  try {
    // Fetch modelos dinámicamente desde el proxy
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const payload = await response.json() as {
      data: Array<{
        id: string;
        name?: string;
        context_window?: number;
        max_tokens?: number;
      }>;
    };

    // Registrar provider con todos los modelos de Go
    pi.registerProvider("routerjev", {
      name: "RouterJev (OpenCode Go)",
      baseUrl: `${baseUrl}/v1`,
      apiKey: apiKey,
      authHeader: true,
      api: "openai-completions",
      models: payload.data.map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        reasoning: false, // Los modelos de Go no soportan extended thinking
        input: ["text"],
        cost: {
          input: 0, // El coste real lo trackea RouterJev internamente
          output: 0,
          cacheRead: 0,
          cacheWrite: 0
        },
        contextWindow: model.context_window ?? 128000,
        maxTokens: model.max_tokens ?? 8192,
      })),
    });

    console.log(`[RouterJev] Registered ${payload.data.length} models from ${baseUrl}`);
  } catch (error) {
    console.error(`[RouterJev] Failed to register provider:`, error);
    console.error(`[RouterJev] Make sure RouterJev proxy is running at ${baseUrl}`);
    console.error(`[RouterJev] Start it with: cd routerjev && npm start`);
  }
}
