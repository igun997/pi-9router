export interface QuotaModelIdentity {
  id: string;
  owned_by?: string;
}

const OWNER_QUOTA_PROVIDER: Record<string, string> = {
  cx: "codex",
};

export function resolveQuotaProvider(model: QuotaModelIdentity): string | undefined {
  if (!model.owned_by) return undefined;
  return OWNER_QUOTA_PROVIDER[model.owned_by] ?? model.owned_by;
}
