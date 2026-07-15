import { CapabilityRules, resolveImageCapability } from "./policy.ts";

export interface RouterImageModel {
  id: string;
  owned_by?: string;
}

export interface GenerateImageOptions {
  baseUrl: string;
  apiKey: string;
  models: readonly RouterImageModel[];
  rules: CapabilityRules;
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
  fetch: typeof globalThis.fetch;
}

export interface GeneratedImages {
  model: string;
  urls: string[];
  base64: string[];
}

function allowedModels(models: readonly RouterImageModel[], rules: CapabilityRules): RouterImageModel[] {
  return models.filter((model) => resolveImageCapability(rules, { id: model.id, provider: model.owned_by }));
}

export function selectImageModel(
  models: readonly RouterImageModel[],
  rules: CapabilityRules,
  requested?: string,
): string {
  const allowed = allowedModels(models, rules);
  if (requested) {
    if (!allowed.some((model) => model.id === requested)) {
      throw new Error(`Image model is not allowed: ${requested}`);
    }
    return requested;
  }

  if (rules.defaultModel) {
    if (!allowed.some((model) => model.id === rules.defaultModel)) {
      throw new Error(`Configured default image model is not allowed: ${rules.defaultModel}`);
    }
    return rules.defaultModel;
  }
  if (allowed.length === 1) return allowed[0].id;
  if (allowed.length === 0) throw new Error("No 9Router image models are allowed by policy");
  throw new Error("Specify model: multiple allowed 9Router image models are available");
}

export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImages> {
  const model = selectImageModel(options.models, options.rules, options.model);
  const body = {
    model,
    prompt: options.prompt,
    ...(options.size ? { size: options.size } : {}),
    ...(options.quality ? { quality: options.quality } : {}),
    ...(options.n ? { n: options.n } : {}),
  };
  const response = await options.fetch(`${options.baseUrl.replace(/\/$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`9Router image generation failed: ${response.status}`);
  const payload = (await response.json()) as { data?: { url?: unknown; b64_json?: unknown }[] };
  const urls = (payload.data ?? []).flatMap((image) => typeof image.url === "string" ? [image.url] : []);
  const base64 = (payload.data ?? []).flatMap((image) => typeof image.b64_json === "string" ? [image.b64_json] : []);
  if (urls.length === 0 && base64.length === 0) throw new Error("9Router image generation returned no image data");
  return { model, urls, base64 };
}
