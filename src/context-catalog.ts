export type ContextSource = "settings" | "endpoint" | "catalog" | "fallback";

export interface ResolvedModelContext {
  contextWindow: number;
  maxTokens: number;
  source: ContextSource;
  reference?: string;
}

export interface ContextResolutionInput {
  id: string;
  endpoint?: { context_window?: unknown; max_tokens?: unknown };
  overrides?: Record<string, { contextWindow: number; maxTokens: number }>;
}

interface VerifiedContextSpec {
  aliases: readonly string[];
  contextWindow: number;
  maxTokens: number;
  reference: string;
}

// Exact public model aliases only. Add entries only with a vendor documentation URL.
const VERIFIED_CONTEXT_SPECS: readonly VerifiedContextSpec[] = [
  {
    aliases: ["gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    reference: "https://platform.openai.com/docs/models/gpt-4o",
  },
  {
    aliases: ["gpt-4.1", "gpt-4.1-2025-04-14"],
    contextWindow: 1_047_576,
    maxTokens: 32_768,
    reference: "https://platform.openai.com/docs/models/gpt-4.1",
  },
  {
    aliases: ["claude-sonnet-4-20250514", "claude-sonnet-4"],
    contextWindow: 200_000,
    maxTokens: 64_000,
    reference: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
  },
  {
    aliases: ["gemini-2.5-pro", "gemini-2.5-pro-preview-06-05"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    reference: "https://ai.google.dev/gemini-api/docs/models#gemini-2.5-pro",
  },
];

const FALLBACK = { contextWindow: 32_000, maxTokens: 4_096 } as const;

function validLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function canonicalId(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1).toLowerCase();
}

export function resolveModelContext(input: ContextResolutionInput): ResolvedModelContext {
  const override = input.overrides?.[input.id];
  if (override && validLimit(override.contextWindow) && validLimit(override.maxTokens)) {
    return { ...override, source: "settings" };
  }

  if (validLimit(input.endpoint?.context_window) && validLimit(input.endpoint?.max_tokens)) {
    return {
      contextWindow: input.endpoint.context_window,
      maxTokens: input.endpoint.max_tokens,
      source: "endpoint",
    };
  }

  const id = canonicalId(input.id);
  const match = VERIFIED_CONTEXT_SPECS.find((spec) => spec.aliases.includes(id));
  if (match) {
    return {
      contextWindow: match.contextWindow,
      maxTokens: match.maxTokens,
      source: "catalog",
      reference: match.reference,
    };
  }

  return { ...FALLBACK, source: "fallback" };
}
