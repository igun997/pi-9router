import { ResolvedModelContext } from "./context-catalog.ts";
import { RouterModel } from "./catalog.ts";

export function inspectRouterModel(
  model: RouterModel,
  context: ResolvedModelContext,
  imageReadAllowed: boolean,
): string {
  return [
    `model: ${model.id}`,
    `owned_by: ${model.owned_by ?? "unknown"}`,
    `context: ${context.contextWindow}`,
    `max tokens: ${context.maxTokens}`,
    `context source: ${context.source}`,
    `image read: ${imageReadAllowed ? "allowed" : "denied"}`,
    ...(context.reference ? [`reference: ${context.reference}`] : []),
  ].join("\n");
}
