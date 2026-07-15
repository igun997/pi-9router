import { resolveModelContext, ResolvedModelContext } from "./context-catalog.ts";
import { resolveImageCapability, CapabilityRules } from "./policy.ts";

export interface RouterModel {
  id: string;
  name?: string;
  owned_by?: string;
  context_window?: unknown;
  max_tokens?: unknown;
}

export interface ProviderModel {
  id: string;
  name: string;
  ownedBy?: string;
  input: ("text" | "image")[];
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  context: ResolvedModelContext;
}

export interface CatalogOptions {
  read: CapabilityRules;
  contextOverrides: Record<string, { contextWindow: number; maxTokens: number }>;
}

export function toProviderModels(models: readonly RouterModel[], options: CatalogOptions): ProviderModel[] {
  return models.map((model) => {
    const context = resolveModelContext({
      id: model.id,
      endpoint: model,
      overrides: options.contextOverrides,
    });
    const input: ("text" | "image")[] = ["text"];
    if (resolveImageCapability(options.read, { id: model.id, provider: model.owned_by })) {
      input.push("image");
    }

    return {
      id: model.id,
      name: model.name ?? model.id,
      ...(model.owned_by ? { ownedBy: model.owned_by } : {}),
      input,
      reasoning: false,
      contextWindow: context.contextWindow,
      maxTokens: context.maxTokens,
      context,
    };
  });
}
