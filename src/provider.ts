import { toProviderModels, RouterModel } from "./catalog.ts";
import { NineRouterCredential } from "./login.ts";
import { CapabilityRules } from "./policy.ts";

export interface NineRouterProviderConfig {
  name: string;
  baseUrl: string;
  api: "openai-completions";
  models: {
    id: string;
    name: string;
    reasoning: boolean;
    input: ("text" | "image")[];
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
    contextWindow: number;
    maxTokens: number;
  }[];
  oauth: {
    name: string;
    login(callbacks: unknown): Promise<NineRouterCredential>;
    refreshToken(credentials: NineRouterCredential): Promise<NineRouterCredential>;
    getApiKey(credentials: NineRouterCredential): string;
  };
}

export interface BuildProviderOptions {
  baseUrl: string;
  models: readonly RouterModel[];
  readPolicy: CapabilityRules;
  contextOverrides: Record<string, { contextWindow: number; maxTokens: number }>;
  login: (callbacks: unknown) => Promise<NineRouterCredential>;
}

export function buildNineRouterProviderConfig(options: BuildProviderOptions): NineRouterProviderConfig {
  const models = toProviderModels(options.models, {
    read: options.readPolicy,
    contextOverrides: options.contextOverrides,
  });

  return {
    name: "9Router",
    baseUrl: `${options.baseUrl}/v1`,
    api: "openai-completions",
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      input: model.input,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    })),
    oauth: {
      name: "9Router",
      login: options.login,
      refreshToken: async (credentials) => credentials,
      getApiKey: (credentials) => credentials.access,
    },
  };
}
