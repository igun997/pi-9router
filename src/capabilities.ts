/**
 * 9Router `/v1/models` capability parsing.
 *
 * The router is authoritative for model capabilities. Each entry may carry a
 * `capabilities` object:
 *
 *   { vision, pdf, audioInput, videoInput, imageOutput, audioOutput, search,
 *     tools, reasoning, thinkingFormat, thinkingCanDisable, thinkingRange,
 *     contextWindow, maxOutput }
 *
 * Reduced shapes exist. Some routes report only `{ thinking, agentic }`, and
 * combo routes report no capabilities at all, so every field is parsed
 * defensively and missing limits fall back to conservative values.
 */

export type ContextSource = "settings" | "capabilities" | "endpoint" | "fallback";

/** pi `compat.thinkingFormat` values. Router formats outside this set are dropped. */
const PI_THINKING_FORMATS = new Set(["openai", "openrouter", "deepseek", "together", "baseten", "zai", "qwen", "chat-template", "qwen-chat-template", "string-thinking", "ant-ling"]);

export const CONTEXT_FALLBACK = { contextWindow: 200_000, maxTokens: 4_096 } as const;

export interface RouterCapabilities {
  vision?: unknown;
  reasoning?: unknown;
  thinking?: unknown;
  agentic?: unknown;
  tools?: unknown;
  pdf?: unknown;
  search?: unknown;
  audioInput?: unknown;
  audioOutput?: unknown;
  videoInput?: unknown;
  imageOutput?: unknown;
  thinkingFormat?: unknown;
  thinkingCanDisable?: unknown;
  contextWindow?: unknown;
  maxOutput?: unknown;
}

export interface ResolvedModelContext {
  contextWindow: number;
  maxTokens: number;
  source: ContextSource;
}

export interface ResolvedCapabilities {
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
  pdf: boolean;
  search: boolean;
  audioInput: boolean;
  videoInput: boolean;
  imageOutput: boolean;
  /** pi-compatible thinking format, or undefined when pi should auto-detect. */
  thinkingFormat?: string;
  /** Present only when thinking cannot be disabled. */
  thinkingLevelMap?: Record<string, string | null>;
  context: ResolvedModelContext;
  /** True when the router published no capability object for this model. */
  unreported: boolean;
}

export interface CapabilityResolutionInput {
  id: string;
  capabilities?: RouterCapabilities;
  /** Legacy pre-capability endpoint fields. */
  endpoint?: { context_window?: unknown; max_tokens?: unknown };
  overrides?: Record<string, { contextWindow: number; maxTokens: number }>;
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function validLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveThinkingFormat(value: unknown): string | undefined {
  return typeof value === "string" && PI_THINKING_FORMATS.has(value) ? value : undefined;
}

export function resolveModelContext(input: CapabilityResolutionInput): ResolvedModelContext {
  const override = input.overrides?.[input.id];
  if (override && validLimit(override.contextWindow) && validLimit(override.maxTokens)) {
    return { contextWindow: override.contextWindow, maxTokens: override.maxTokens, source: "settings" };
  }

  const capabilities = input.capabilities;
  if (validLimit(capabilities?.contextWindow) && validLimit(capabilities?.maxOutput)) {
    return {
      contextWindow: capabilities.contextWindow,
      maxTokens: capabilities.maxOutput,
      source: "capabilities",
    };
  }

  if (validLimit(input.endpoint?.context_window) && validLimit(input.endpoint?.max_tokens)) {
    return {
      contextWindow: input.endpoint.context_window,
      maxTokens: input.endpoint.max_tokens,
      source: "endpoint",
    };
  }

  return { ...CONTEXT_FALLBACK, source: "fallback" };
}

export function resolveCapabilities(input: CapabilityResolutionInput): ResolvedCapabilities {
  const capabilities = input.capabilities;
  // Reduced router shapes signal reasoning through `thinking` instead of `reasoning`.
  const reasoning = isTrue(capabilities?.reasoning) || isTrue(capabilities?.thinking);
  const thinkingFormat = resolveThinkingFormat(capabilities?.thinkingFormat);
  const cannotDisableThinking = reasoning && capabilities?.thinkingCanDisable === false;

  return {
    vision: isTrue(capabilities?.vision),
    reasoning,
    tools: isTrue(capabilities?.tools),
    pdf: isTrue(capabilities?.pdf),
    search: isTrue(capabilities?.search),
    audioInput: isTrue(capabilities?.audioInput),
    videoInput: isTrue(capabilities?.videoInput),
    imageOutput: isTrue(capabilities?.imageOutput),
    ...(thinkingFormat ? { thinkingFormat } : {}),
    ...(cannotDisableThinking ? { thinkingLevelMap: { off: null } } : {}),
    context: resolveModelContext(input),
    unreported: !capabilities || Object.keys(capabilities).length === 0,
  };
}
