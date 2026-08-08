/**
 * 9Router extension for pi.
 *
 * Registers provider (like local-llm) + custom tools for:
 * - Quota check per provider
 * - Provider status/list
 * - Test provider connection
 * - Model aliases
 * - Router settings
 *
 * Env vars:
 *   NINEROUTER_URL - base URL (default: http://localhost:20128)
 *   NINEROUTER_KEY - API key (from Dashboard → Keys)
 *   NINE_ROUTER_PASSWORD - password (optional, some routers have no auth)
 */
import { AuthStorage, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { homedir } from "node:os";
import { Type } from "typebox";
import { resolveCapabilities } from "./src/capabilities.ts";
import { RouterModel } from "./src/catalog.ts";
import { inspectRouterModel } from "./src/inspect.ts";
import { generateImage } from "./src/images.ts";
import { loginNineRouter, LoginCallbacks } from "./src/login.ts";
import { buildNineRouterProviderConfig } from "./src/provider.ts";
import { resolveQuotaProvider } from "./src/quota.ts";
import { loadNineRouterSettings, saveNineRouterBaseUrl } from "./src/settings.ts";

interface RouterConfig {
  baseUrl: string;
  password?: string;
  token?: string;
}

function quotaPercent(q: any): number {
  if (typeof q.remainingPercentage === "number") return q.remainingPercentage;
  if (typeof q.remaining === "number" && typeof q.total === "number" && q.total > 0) {
    return (q.remaining / q.total) * 100;
  }
  if (typeof q.used === "number" && typeof q.total === "number" && q.total > 0) {
    return Math.max(0, 100 - (q.used / q.total) * 100);
  }
  return 100;
}

function formatQuotaEntry(name: string, q: any): string {
  const label = q.displayName ?? name;
  if (q.unlimited) return `${label}: unlimited`;
  if (q.remaining != null && q.total != null) return `${label}: ${q.remaining}/${q.total}`;
  if (q.used != null && q.total != null) return `${label}: ${q.used}/${q.total} used`;
  return `${label}: unlimited`;
}

async function quotaLinesForModel(
  config: RouterConfig,
  modelId?: string,
  ownedBy?: string,
): Promise<string[]> {
  const selectedProvider = ownedBy ? resolveQuotaProvider({ id: modelId ?? "", owned_by: ownedBy }) : undefined;
  const data = await apiGet(
    config,
    `/api/providers/client?page=1&pageSize=50&accountStatus=active&sort=priority`
  );
  const active = (data.connections ?? []).filter((c: any) => c.isActive);
  const connections = selectedProvider
    ? active.filter((c: any) => c.provider === selectedProvider)
    : active;
  const title = selectedProvider && modelId
    ? `⚡ 9Router Quota for ${modelId} (${selectedProvider}):`
    : `⚡ 9Router Quota:`;
  const lines: string[] = [title];

  for (const conn of connections) {
    try {
      const usage = await apiGet(config, `/api/usage/${conn.id}`);
      const quotaEntries = Object.entries(usage.quotas ?? {}) as [string, any][];
      if (quotaEntries.length === 0) continue;

      const lowest = quotaEntries.reduce((min, [, q]) => Math.min(min, quotaPercent(q)), 100);
      const status = lowest <= 10 ? "🔴" : lowest <= 30 ? "🟡" : "🟢";
      const quotaSummary = quotaEntries.map(([name, q]) => formatQuotaEntry(name, q)).join(", ");

      lines.push(`  ${status} ${conn.provider}/${conn.name} [${usage.plan ?? ""}] ${quotaSummary}`);
    } catch {
      // skip failed quota fetch
    }
  }

  return lines;
}

async function dashboardLogin(config: RouterConfig): Promise<string | null> {
  if (!config.password) return null;

  const res = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: config.password }),
  });

  if (!res.ok) return null;

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/auth_token=([^;]+)/);
  return match?.[1] ?? null;
}

function authHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return { Cookie: `auth_token=${token}` };
}

async function apiGet(config: RouterConfig, path: string): Promise<any> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    headers: { Accept: "application/json", ...authHeaders(config.token ?? null) },
  });
  if (res.status === 401 && config.password) {
    // Re-login on 401
    config.token = (await dashboardLogin(config)) ?? undefined;
    const retry = await fetch(`${config.baseUrl}${path}`, {
      headers: { Accept: "application/json", ...authHeaders(config.token ?? null) },
    });
    return retry.json();
  }
  return res.json();
}

async function apiPost(config: RouterConfig, path: string, body?: any): Promise<any> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...authHeaders(config.token ?? null),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && config.password) {
    config.token = (await dashboardLogin(config)) ?? undefined;
    const retry = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(config.token ?? null),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return retry.json();
  }
  return res.json();
}

export default async function (pi: ExtensionAPI) {
  const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");
  const projectSettingsPath = join(process.cwd(), ".pi", "settings.json");
  const settings = loadNineRouterSettings({
    globalPath: globalSettingsPath,
    projectPath: projectSettingsPath,
  });
  const config: RouterConfig = {
    // Environment names remain compatibility fallback. New login persists only pi9router.baseUrl.
    baseUrl: settings.baseUrl === "http://localhost:20128"
      ? process.env.NINEROUTER_URL ?? process.env.NINE_ROUTER_URL ?? settings.baseUrl
      : settings.baseUrl,
    password: process.env.NINE_ROUTER_PASSWORD,
  };

  if (config.password) {
    config.token = (await dashboardLogin(config)) ?? undefined;
  }

  let routerModels: RouterModel[] = [];
  const discoverModels = async (baseUrl: string, apiKey?: string) => {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`9Router model discovery failed: ${response.status}`);
    const payload = (await response.json()) as { data?: RouterModel[] };
    routerModels = payload.data ?? [];
  };

  const registerProvider = () => {
    const provider = buildNineRouterProviderConfig({
      baseUrl: config.baseUrl,
      models: routerModels,
      contextOverrides: settings.context.models,
      login: async (callbacks) => {
        const credential = await loginNineRouter(callbacks as LoginCallbacks, {
          defaultBaseUrl: config.baseUrl,
          saveBaseUrl: (baseUrl) => {
            saveNineRouterBaseUrl(globalSettingsPath, baseUrl);
            config.baseUrl = baseUrl;
          },
          fetch,
        });
        await discoverModels(config.baseUrl, credential.access);
        registerProvider();
        return credential;
      },
    });
    pi.registerProvider("9router", provider as any);
  };

  try {
    await discoverModels(config.baseUrl);
  } catch {
    // Keep native /login available while a remote router is offline or requires an API key.
  }
  registerProvider();

  // Tool: List providers with status
  pi.registerTool({
    name: "ninerouter_providers",
    label: "9Router Providers",
    description:
      "List all 9Router provider connections with status, activity, and errors. Shows which accounts are active/inactive.",
    parameters: Type.Object({
      status: Type.Optional(
        Type.String({ description: "Filter: all, active, inactive (default: all)" })
      ),
    }),
    async execute(_toolCallId, params) {
      const filter = params.status ?? "all";
      const data = await apiGet(
        config,
        `/api/providers/client?page=1&pageSize=50&accountStatus=${filter}&sort=priority`
      );

      const connections = (data.connections ?? []).map((c: any) => ({
        id: c.id,
        provider: c.provider,
        name: c.name,
        email: c.email,
        isActive: c.isActive,
        testStatus: c.testStatus,
        lastError: c.lastError ? c.lastError.substring(0, 100) : null,
        lastErrorAt: c.lastErrorAt,
        expiresAt: c.expiresAt,
        lastUsedAt: c.lastUsedAt,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(connections, null, 2) }],
        details: { count: connections.length },
      };
    },
  });

  // Tool: Check quota/usage for a provider
  pi.registerTool({
    name: "ninerouter_quota",
    label: "9Router Quota",
    description:
      "Check quota/usage for a specific provider connection or all providers. Shows remaining credits, session limits, reset times.",
    parameters: Type.Object({
      providerId: Type.Optional(
        Type.String({ description: "Provider connection UUID. If omitted, checks all active providers." })
      ),
    }),
    async execute(_toolCallId, params) {
      if (params.providerId) {
        const usage = await apiGet(config, `/api/usage/${params.providerId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(usage, null, 2) }],
          details: { providerId: params.providerId },
        };
      }

      // Get all active providers and their quotas
      const data = await apiGet(
        config,
        `/api/providers/client?page=1&pageSize=50&accountStatus=active&sort=priority`
      );
      const results: any[] = [];

      for (const conn of data.connections ?? []) {
        try {
          const usage = await apiGet(config, `/api/usage/${conn.id}`);
          results.push({
            id: conn.id,
            provider: conn.provider,
            name: conn.name,
            plan: usage.plan,
            quotas: usage.quotas,
            limitReached: usage.limitReached,
          });
        } catch {
          results.push({
            id: conn.id,
            provider: conn.provider,
            name: conn.name,
            error: "Failed to fetch usage",
          });
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: { count: results.length },
      };
    },
  });

  // Tool: Test a provider connection
  pi.registerTool({
    name: "ninerouter_test",
    label: "9Router Test",
    description: "Test a provider connection to check if it's working. Returns valid/error status.",
    parameters: Type.Object({
      providerId: Type.String({ description: "Provider connection UUID to test" }),
    }),
    async execute(_toolCallId, params) {
      const result = await apiPost(config, `/api/providers/${params.providerId}/test`);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  // Tool: Get model aliases
  pi.registerTool({
    name: "ninerouter_aliases",
    label: "9Router Aliases",
    description: "List model aliases configured in 9Router. Shows shorthand names mapped to full model paths.",
    parameters: Type.Object({}),
    async execute() {
      const data = await apiGet(config, `/api/models/alias`);
      return {
        content: [{ type: "text", text: JSON.stringify(data.aliases ?? data, null, 2) }],
        details: { count: Object.keys(data.aliases ?? data).length },
      };
    },
  });

  // Tool: Get router settings
  pi.registerTool({
    name: "ninerouter_settings",
    label: "9Router Settings",
    description:
      "Get 9Router configuration: tunnel status, provider strategies, combo strategies, sticky limits.",
    parameters: Type.Object({}),
    async execute() {
      const data = await apiGet(config, `/api/settings`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        details: {},
      };
    },
  });

  // Tool: Generate image through an explicitly allowed 9Router image model.
  pi.registerTool({
    name: "ninerouter_generate_image",
    label: "9Router Generate Image",
    description: "Generate an image with an allowed 9Router image model. Image policy denies all models until pi9router.images.generate enables them.",
    parameters: Type.Object({
      prompt: Type.String({ description: "Image generation prompt." }),
      model: Type.Optional(Type.String({ description: "Allowed 9Router image model. Required when more than one allowed model exists." })),
      size: Type.Optional(Type.String({ description: "Provider-supported image size." })),
      quality: Type.Optional(Type.String({ description: "Provider-supported image quality." })),
      n: Type.Optional(Type.Integer({ minimum: 1, maximum: 4, description: "Number of images." })),
    }),
    async execute(_toolCallId, params) {
      const credential = AuthStorage.create().get("9router");
      if (!credential || credential.type !== "oauth") {
        return {
          content: [{ type: "text", text: "9Router is not logged in. Run /login 9router." }],
          details: { ok: false },
          isError: true,
        };
      }
      try {
        const imageModelsResponse = await fetch(`${config.baseUrl}/v1/models/image`, {
          headers: { Authorization: `Bearer ${credential.access}`, Accept: "application/json" },
        });
        if (!imageModelsResponse.ok) throw new Error(`9Router image model discovery failed: ${imageModelsResponse.status}`);
        const imageModels = (await imageModelsResponse.json()) as { data?: RouterModel[] };
        const result = await generateImage({
          baseUrl: config.baseUrl,
          apiKey: credential.access,
          models: imageModels.data ?? [],
          rules: settings.images.generate,
          prompt: params.prompt,
          model: params.model,
          size: params.size,
          quality: params.quality,
          n: params.n,
          fetch,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          details: { ok: false },
          isError: true,
        };
      }
    },
  });

  // Tool: Health check
  pi.registerTool({
    name: "ninerouter_health",
    label: "9Router Health",
    description: "Quick health check of the 9Router instance.",
    parameters: Type.Object({}),
    async execute() {
      try {
        const data = await apiGet(config, `/api/health`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          details: data,
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `9Router unreachable: ${e.message}` }],
          details: { ok: false },
          isError: true,
        };
      }
    },
  });

  pi.registerCommand("9r-quota", {
    description: "Check 9Router quota; prompts dashboard password for this command only",
    handler: async (args, ctx) => {
      const password = await ctx.ui.input("9Router dashboard password", "Used only for this quota check.", "");
      if (!password) return;
      const quotaConfig: RouterConfig = { baseUrl: config.baseUrl, password };
      quotaConfig.token = (await dashboardLogin(quotaConfig)) ?? undefined;
      if (!quotaConfig.token) {
        ctx.ui.notify("9Router dashboard login failed.", "error");
        return;
      }
      const modelId = args.trim() || undefined;
      const model = modelId ? routerModels.find((candidate) => candidate.id === modelId) : undefined;
      try {
        const lines = await quotaLinesForModel(quotaConfig, modelId, model?.owned_by);
        ctx.ui.notify(lines.join("\n"), "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  // Legacy entry point. Pi-native authentication lives in /login 9router.
  pi.registerCommand("9r-setup", {
    description: "Show native 9Router login instructions",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Run /login 9router. It stores the API key in Pi auth.json and never writes .env.", "info");
    },
  });

  pi.registerCommand("9r-settings", {
    description: "Show resolved public 9Router URL, image generation policy, and context overrides",
    handler: async (_args, ctx) => {
      const vision = routerModels.filter((model) => model.capabilities?.vision === true).length;
      ctx.ui.notify(JSON.stringify({
        baseUrl: config.baseUrl,
        models: routerModels.length,
        visionModels: vision,
        images: settings.images,
        context: settings.context,
      }, null, 2), "info");
    },
  });

  pi.registerCommand("9r-model", {
    description: "Inspect router-reported model capabilities: /9r-model <model-id>",
    handler: async (args, ctx) => {
      const modelId = args.trim();
      const model = routerModels.find((candidate) => candidate.id === modelId);
      if (!model) {
        ctx.ui.notify(`Model not found: ${modelId || "(missing model id)"}`, "error");
        return;
      }
      const capabilities = resolveCapabilities({
        id: model.id,
        capabilities: model.capabilities,
        endpoint: model,
        overrides: settings.context.models,
      });
      ctx.ui.notify(inspectRouterModel(model, capabilities), "info");
    },
  });

  // Command: /9r - quick status overview
  pi.registerCommand("9r", {
    description: "Quick 9Router status: health + active providers + quota summary",
    handler: async (_args, ctx) => {
      try {
        const health = await apiGet(config, `/api/health`);
        if (!health.ok) {
          ctx.ui.notify("9Router: DOWN", "error");
          return;
        }

        const data = await apiGet(
          config,
          `/api/providers/client?page=1&pageSize=50&accountStatus=active&sort=priority`
        );
        const active = (data.connections ?? []).filter((c: any) => c.isActive);
        const lines = [`9Router: OK | ${active.length} active providers`];

        for (const conn of active.slice(0, 5)) {
          lines.push(`  ${conn.provider}/${conn.name} [${conn.testStatus}]`);
        }

        ctx.ui.notify(lines.join("\n"), "info");
      } catch (e: any) {
        ctx.ui.notify(`9Router unreachable: ${e.message}`, "error");
      }
    },
  });
}
