export interface CapabilityRules {
  default?: boolean;
  providers?: Record<string, boolean>;
  models?: Record<string, boolean>;
  defaultModel?: string;
}

export interface ImageModelIdentity {
  id: string;
  provider?: string;
}

function matchesModelPattern(pattern: string, modelId: string): boolean {
  const expression = `^${pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")}$`;
  return new RegExp(expression).test(modelId);
}

export function resolveImageCapability(
  rules: CapabilityRules | undefined,
  model: ImageModelIdentity,
): boolean {
  if (!rules) return false;

  const exact = rules.models?.[model.id];
  if (typeof exact === "boolean") return exact;

  for (const [pattern, allowed] of Object.entries(rules.models ?? {})) {
    if (pattern.includes("*") && matchesModelPattern(pattern, model.id)) return allowed;
  }

  if (model.provider) {
    const provider = rules.providers?.[model.provider];
    if (typeof provider === "boolean") return provider;
  }

  return rules.default ?? false;
}
