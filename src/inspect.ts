import { ResolvedCapabilities } from "./capabilities.ts";
import { RouterModel } from "./catalog.ts";

export function inspectRouterModel(model: RouterModel, capabilities: ResolvedCapabilities): string {
  const extras = [
    capabilities.tools ? "tools" : undefined,
    capabilities.search ? "search" : undefined,
    capabilities.pdf ? "pdf" : undefined,
    capabilities.audioInput ? "audio-in" : undefined,
    capabilities.videoInput ? "video-in" : undefined,
    capabilities.imageOutput ? "image-out" : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  return [
    `model: ${model.id}`,
    `owned_by: ${model.owned_by ?? "unknown"}`,
    `vision (image read): ${capabilities.vision ? "yes" : "no"}`,
    `reasoning: ${capabilities.reasoning ? "yes" : "no"}`,
    `context: ${capabilities.context.contextWindow}`,
    `max tokens: ${capabilities.context.maxTokens}`,
    `context source: ${capabilities.context.source}`,
    ...(capabilities.thinkingFormat ? [`thinking format: ${capabilities.thinkingFormat}`] : []),
    ...(capabilities.thinkingLevelMap ? ["thinking: cannot be disabled"] : []),
    ...(extras.length > 0 ? [`other: ${extras.join(", ")}`] : []),
    ...(capabilities.unreported ? ["note: router reported no capabilities; using fallback limits and text-only input"] : []),
  ].join("\n");
}
