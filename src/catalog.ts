import {
  resolveCapabilities,
  type ResolvedCapabilities,
  type RouterCapabilities,
} from "./capabilities.ts";

export interface RouterModel {
  id: string;
  name?: string;
  owned_by?: string;
  capabilities?: RouterCapabilities;
  /** Legacy pre-capability limits. */
  context_window?: unknown;
  max_tokens?: unknown;
}

export interface ProviderModel {
  id: string;
  name: string;
  ownedBy?: string;
  input: ("text" | "image")[];
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  compat?: { thinkingFormat: string };
  contextWindow: number;
  maxTokens: number;
  capabilities: ResolvedCapabilities;
}

export interface CatalogOptions {
  contextOverrides: Record<string, { contextWindow: number; maxTokens: number }>;
}

/**
 * Convert discovered router models into pi provider models.
 *
 * `capabilities.vision` decides `input`, which is the single pi-wide gate for
 * image content: the built-in `read` tool, `@file` attachments, paste, and
 * drag/drop all drop images for models without `"image"` input.
 */
export function toProviderModels(models: readonly RouterModel[], options: CatalogOptions): ProviderModel[] {
  return models.map((model) => {
    const capabilities = resolveCapabilities({
      id: model.id,
      capabilities: model.capabilities,
      endpoint: model,
      overrides: options.contextOverrides,
    });

    return {
      id: model.id,
      name: model.name ?? model.id,
      ...(model.owned_by ? { ownedBy: model.owned_by } : {}),
      input: capabilities.vision ? ["text", "image"] : ["text"],
      reasoning: capabilities.reasoning,
      ...(capabilities.thinkingLevelMap ? { thinkingLevelMap: capabilities.thinkingLevelMap } : {}),
      ...(capabilities.thinkingFormat ? { compat: { thinkingFormat: capabilities.thinkingFormat } } : {}),
      contextWindow: capabilities.context.contextWindow,
      maxTokens: capabilities.context.maxTokens,
      capabilities,
    };
  });
}
