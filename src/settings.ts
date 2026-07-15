import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CapabilityRules } from "./policy.ts";

export interface NineRouterSettings {
  baseUrl: string;
  images: {
    read: Required<Pick<CapabilityRules, "default" | "providers" | "models">>;
    generate: Required<Pick<CapabilityRules, "default" | "providers" | "models">> & {
      defaultModel?: string;
    };
  };
  context: { models: Record<string, { contextWindow: number; maxTokens: number }> };
}

export interface LoadSettingsOptions {
  globalPath: string;
  projectPath: string;
}

type RawSettings = {
  pi9router?: {
    baseUrl?: unknown;
    images?: {
      read?: CapabilityRules;
      generate?: CapabilityRules;
    };
    context?: { models?: Record<string, { contextWindow?: unknown; maxTokens?: unknown }> };
  };
};

const EMPTY_RULES = { default: false, providers: {}, models: {} } as const;

function readDocument(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readSettings(path: string): RawSettings {
  return readDocument(path) as RawSettings;
}

function normalizeBaseUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function normalizeRules(...sources: (CapabilityRules | undefined)[]): CapabilityRules {
  const result: CapabilityRules = { ...EMPTY_RULES, providers: {}, models: {} };
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    if (typeof source.default === "boolean") result.default = source.default;
    if (typeof source.defaultModel === "string" && source.defaultModel) {
      result.defaultModel = source.defaultModel;
    }
    for (const [provider, allowed] of Object.entries(source.providers ?? {})) {
      if (typeof allowed === "boolean") result.providers![provider] = allowed;
    }
    for (const [model, allowed] of Object.entries(source.models ?? {})) {
      if (typeof allowed === "boolean") result.models![model] = allowed;
    }
  }
  return result;
}

function normalizeContext(...sources: (RawSettings["pi9router"] | undefined)[]): NineRouterSettings["context"] {
  const models: NineRouterSettings["context"]["models"] = {};
  for (const source of sources) {
    for (const [model, value] of Object.entries(source?.context?.models ?? {})) {
      if (
        typeof value?.contextWindow === "number" &&
        value.contextWindow > 0 &&
        typeof value.maxTokens === "number" &&
        value.maxTokens > 0
      ) {
        models[model] = { contextWindow: value.contextWindow, maxTokens: value.maxTokens };
      }
    }
  }
  return { models };
}

export function saveNineRouterBaseUrl(settingsPath: string, baseUrl: string): void {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) throw new Error(`Invalid 9Router URL: ${baseUrl}`);
  const document = readDocument(settingsPath);
  const current = document.pi9router;
  document.pi9router = {
    ...(current && typeof current === "object" ? current : {}),
    baseUrl: normalized,
  };
  writeFileSync(settingsPath, JSON.stringify(document, null, 2) + "\n");
}

export function loadNineRouterSettings(options: LoadSettingsOptions): NineRouterSettings {
  const global = readSettings(options.globalPath).pi9router;
  const project = readSettings(options.projectPath).pi9router;
  const baseUrl = normalizeBaseUrl(project?.baseUrl) ?? normalizeBaseUrl(global?.baseUrl) ?? "http://localhost:20128";
  const read = normalizeRules(global?.images?.read, project?.images?.read);
  const generate = normalizeRules(global?.images?.generate, project?.images?.generate);

  return {
    baseUrl,
    images: {
      read: { default: read.default ?? false, providers: read.providers ?? {}, models: read.models ?? {} },
      generate: {
        default: generate.default ?? false,
        providers: generate.providers ?? {},
        models: generate.models ?? {},
        ...(generate.defaultModel ? { defaultModel: generate.defaultModel } : {}),
      },
    },
    context: normalizeContext(global, project),
  };
}
