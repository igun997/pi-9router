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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { Type } from "typebox";

interface RouterConfig {
  baseUrl: string;
  password?: string;
  token?: string;
}

const MODEL_PROVIDER_PREFIX: Record<string, string> = {
  cx: "codex",
  cc: "claude",
  kr: "kiro",
  ag: "antigravity",
  cu: "cursor",
  gh: "github",
  mm: "minimax",
};

function providerForModelId(modelId: string): string | null {
  const prefix = modelId.split("/", 1)[0];
  return MODEL_PROVIDER_PREFIX[prefix] ?? null;
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

async function login(config: RouterConfig): Promise<string | null> {
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
    config.token = (await login(config)) ?? undefined;
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
    config.token = (await login(config)) ?? undefined;
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
  const config: RouterConfig = {
    baseUrl: process.env.NINEROUTER_URL ?? process.env.NINE_ROUTER_URL ?? "http://localhost:20128",
    password: process.env.NINE_ROUTER_PASSWORD,
  };

  // Login if password provided
  if (config.password) {
    config.token = (await login(config)) ?? undefined;
  }

  // Register as LLM provider (same as local-llm but with 9router branding)
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`);
    if (response.ok) {
      const payload = (await response.json()) as {
        data: Array<{
          id: string;
          name?: string;
          context_window?: number;
          max_tokens?: number;
        }>;
      };

      const apiKey = process.env.NINEROUTER_KEY ?? process.env.NINE_ROUTER_API_KEY ?? "";
      if (!apiKey) return; // apiKey required by pi; skip registration if not set

      pi.registerProvider("9router", {
        name: "9Router",
        baseUrl: `${config.baseUrl}/v1`,
        apiKey,
        api: "openai-completions",
        models: payload.data.map((model) => ({
          id: model.id,
          name: model.name ?? model.id,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: model.context_window ?? 128000,
          maxTokens: model.max_tokens ?? 4096,
        })),
      });
    }
  } catch {
    // Router not reachable - skip provider registration
  }

  // Tool: List providers with status
  pi.registerTool({
    name: "9router_providers",
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
    name: "9router_quota",
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
    name: "9router_test",
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
    name: "9router_aliases",
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
    name: "9router_settings",
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

  // Tool: Health check
  pi.registerTool({
    name: "9router_health",
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

  // Event: Show quota when selecting 9router model
  pi.on("model_select", async (event, ctx) => {
    if (event.model.provider !== "9router") return;

    try {
      const selectedProvider = providerForModelId(event.model.id);
      const data = await apiGet(
        config,
        `/api/providers/client?page=1&pageSize=50&accountStatus=active&sort=priority`
      );
      const active = (data.connections ?? []).filter((c: any) => c.isActive);
      const connections = selectedProvider
        ? active.filter((c: any) => c.provider === selectedProvider)
        : active;
      const title = selectedProvider
        ? `⚡ 9Router Quota for ${event.model.id} (${selectedProvider}):`
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

      if (lines.length > 1) {
        ctx.ui.notify(lines.join("\n"), "info");
      }
    } catch {
      // Router unreachable, skip silently
    }
  });

  // Command: /9r-setup - interactive setup wizard
  pi.registerCommand("9r-setup", {
    description: "Setup wizard for 9Router: configure URL, password, API key",
    handler: async (_args, ctx) => {
      // Step 1: URL
      const url = await ctx.ui.input(
        "9Router URL",
        "Base URL of your 9Router instance",
        config.baseUrl
      );
      if (!url) return;

      // Step 2: Health check
      ctx.ui.notify(`Testing ${url}...`, "info");
      try {
        const healthRes = await fetch(`${url}/api/health`);
        const health = await healthRes.json();
        if (!health.ok) {
          ctx.ui.notify(`${url} responded but not healthy`, "error");
          return;
        }
        ctx.ui.notify(`✓ ${url} is reachable`, "info");
      } catch {
        ctx.ui.notify(`✗ Cannot reach ${url}`, "error");
        return;
      }

      // Step 3: Check if auth required
      let authToken: string | null = null;
      try {
        const statusRes = await fetch(`${url}/api/auth/status`);
        const status = await statusRes.json();

        if (status.requireLogin) {
          const password = await ctx.ui.input(
            "Password",
            `${url} requires login. Enter password:`,
            ""
          );
          if (!password) return;

          const loginRes = await fetch(`${url}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });

          if (!loginRes.ok) {
            ctx.ui.notify("✗ Login failed. Wrong password?", "error");
            return;
          }

          const setCookie = loginRes.headers.get("set-cookie") ?? "";
          const match = setCookie.match(/auth_token=([^;]+)/);
          authToken = match?.[1] ?? null;
          ctx.ui.notify("✓ Logged in", "info");

          // Save password to config
          config.password = password;
          config.token = authToken ?? undefined;
          config.baseUrl = url;
        } else {
          ctx.ui.notify("No auth required on this instance", "info");
          config.baseUrl = url;
        }
      } catch {
        ctx.ui.notify("Could not check auth status", "error");
        return;
      }

      // Step 4: Get/show API keys
      let apiKey = "";
      try {
        const keysRes = await fetch(`${url}/api/keys`, {
          headers: authToken ? { Cookie: `auth_token=${authToken}` } : {},
        });
        const keysData = await keysRes.json();
        const keys = (keysData.keys ?? []).filter((k: any) => k.isActive);

        if (keys.length > 0) {
          const choices = keys.map((k: any) => `${k.name}: ${k.key}`);
          choices.push("[Enter manually]");
          const picked = await ctx.ui.select("Select API Key", choices);

          if (picked === "[Enter manually]") {
            apiKey = (await ctx.ui.input("API Key", "Enter your 9Router API key (sk-...)", "")) ?? "";
          } else if (picked) {
            apiKey = picked.split(": ")[1] ?? "";
          }
        } else {
          apiKey = (await ctx.ui.input("API Key", "No keys found. Enter API key (or leave empty if not required):", "")) ?? "";
        }
      } catch {
        apiKey = (await ctx.ui.input("API Key", "Could not fetch keys. Enter API key manually (or leave empty):", "")) ?? "";
      }

      // Step 5: Show config summary
      const envObj: Record<string, string> = { NINEROUTER_URL: url };
      if (config.password) envObj.NINE_ROUTER_PASSWORD = config.password;
      if (apiKey) envObj.NINEROUTER_KEY = apiKey;

      const envLines = [
        `NINEROUTER_URL=${url}`,
        config.password ? `NINE_ROUTER_PASSWORD=${config.password}` : null,
        apiKey ? `NINEROUTER_KEY=${apiKey}` : null,
      ].filter(Boolean);

      const settingsJson = JSON.stringify({ packages: ["/home/nst/WebstormProjects/pi-9router"], env: envObj }, null, 2);

      const saveChoice = await ctx.ui.select("Save config to:", [
        ".env (project)",
        "~/.pi/agent/settings.json (global)",
        "Show only (don't save)",
      ]);

      if (saveChoice === ".env (project)") {
        const envPath = join(ctx.cwd, ".env");
        const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
        const newContent = existing
          ? existing.replace(/^(NINE_ROUTER_|NINEROUTER_).*$/gm, "").trim() + "\n" + envLines.join("\n") + "\n"
          : envLines.join("\n") + "\n";
        writeFileSync(envPath, newContent);
        ctx.ui.notify(`✓ Saved to ${envPath}`, "info");
      } else if (saveChoice?.includes("settings.json")) {
        const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
        let settings: any = {};
        if (existsSync(settingsPath)) {
          try {
            settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
          } catch {}
        }
        settings.packages = settings.packages || [];
        if (!settings.packages.includes("/home/nst/WebstormProjects/pi-9router")) {
          settings.packages.push("/home/nst/WebstormProjects/pi-9router");
        }
        settings.env = settings.env || {};
        settings.env.NINEROUTER_URL = url;
        if (config.password) settings.env.NINE_ROUTER_PASSWORD = config.password;
        if (apiKey) settings.env.NINEROUTER_KEY = apiKey;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        ctx.ui.notify(`✓ Saved to ${settingsPath}`, "info");
      } else {
        ctx.ui.notify(
          `Config:\n${envLines.join("\n")}\n\nFor pi agent/settings.json:\n${settingsJson}`,
          "info"
        );
      }

      // Step 6: Verify models load + register provider live
      try {
        const modelsRes = await fetch(`${url}/v1/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });
        const payload = await modelsRes.json() as {
          data: Array<{ id: string; name?: string; context_window?: number; max_tokens?: number }>;
        };
        const modelCount = payload.data?.length ?? 0;
        ctx.ui.notify(`✓ ${modelCount} models available via 9router/`, "info");

        // Register provider live so models are available immediately (no restart needed)
        if (apiKey && modelCount > 0) {
          pi.registerProvider("9router", {
            name: "9Router",
            baseUrl: `${url}/v1`,
            apiKey,
            api: "openai-completions",
            models: payload.data.map((model) => ({
              id: model.id,
              name: model.name ?? model.id,
              reasoning: false,
              input: ["text"] as ("text" | "image")[],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: model.context_window ?? 128000,
              maxTokens: model.max_tokens ?? 4096,
            })),
          });
          ctx.ui.notify("✓ 9router provider registered — models available now (no restart needed)", "info");
        } else if (!apiKey) {
          ctx.ui.notify("⚠ No API key set — restart pi to load 9router models after saving config", "error");
        }
      } catch {
        ctx.ui.notify("⚠ Could not verify models endpoint", "error");
      }
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
