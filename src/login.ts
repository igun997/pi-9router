export interface LoginCallbacks {
  onPrompt(params: { message: string }): Promise<string>;
  onSelect(params: {
    message: string;
    options: { id: string; label: string }[];
  }): Promise<string | undefined>;
}

export interface NineRouterCredential {
  refresh: string;
  access: string;
  expires: number;
}

export interface LoginDependencies {
  defaultBaseUrl: string;
  saveBaseUrl(baseUrl: string): void | Promise<void>;
  fetch: typeof globalThis.fetch;
}

function normalizeBaseUrl(value: string, fallback: string): string {
  const candidate = value.trim() || fallback;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`Invalid 9Router URL: ${candidate}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid 9Router URL protocol: ${url.protocol}`);
  }
  return url.toString().replace(/\/$/, "");
}

async function selectDashboardApiKey(
  callbacks: LoginCallbacks,
  dependencies: LoginDependencies,
  baseUrl: string,
): Promise<string> {
  const password = await callbacks.onPrompt({ message: "Enter dashboard password:" });
  if (!password) throw new Error("9Router dashboard login cancelled");

  const loginResponse = await dependencies.fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!loginResponse.ok) throw new Error(`9Router dashboard login failed: ${loginResponse.status}`);

  const cookie = loginResponse.headers.get("set-cookie")?.match(/auth_token=([^;]+)/)?.[1];
  if (!cookie) throw new Error("9Router dashboard login returned no auth token");

  const keysResponse = await dependencies.fetch(`${baseUrl}/api/keys`, {
    headers: { Cookie: `auth_token=${cookie}`, Accept: "application/json" },
  });
  if (!keysResponse.ok) throw new Error(`9Router API key lookup failed: ${keysResponse.status}`);

  const payload = (await keysResponse.json()) as {
    keys?: { id?: string; name?: string; key?: string; isActive?: boolean }[];
  };
  const keys = (payload.keys ?? []).filter(
    (key): key is { id: string; name?: string; key: string; isActive?: boolean } =>
      key.isActive === true && typeof key.id === "string" && typeof key.key === "string",
  );
  if (keys.length === 0) throw new Error("No active 9Router API keys found");

  const selected = await callbacks.onSelect({
    message: "Select API key:",
    options: keys.map((key) => ({ id: key.id, label: key.name ?? key.id })),
  });
  if (!selected) throw new Error("9Router API key selection cancelled");
  const key = keys.find((candidate) => candidate.id === selected)?.key;
  if (!key) throw new Error("Selected 9Router API key is unavailable");
  return key;
}

async function validateApiKey(dependencies: LoginDependencies, baseUrl: string, apiKey: string): Promise<void> {
  const response = await dependencies.fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`9Router API key validation failed: ${response.status}`);
}

export async function loginNineRouter(
  callbacks: LoginCallbacks,
  dependencies: LoginDependencies,
): Promise<NineRouterCredential> {
  const suppliedUrl = await callbacks.onPrompt({
    message: `9Router URL (leave empty for ${dependencies.defaultBaseUrl}):`,
  });
  const baseUrl = normalizeBaseUrl(suppliedUrl, dependencies.defaultBaseUrl);
  const method = await callbacks.onSelect({
    message: "Choose login method:",
    options: [
      { id: "direct", label: "Enter API key" },
      { id: "dashboard", label: "Use dashboard password to select an API key" },
    ],
  });
  if (!method) throw new Error("9Router login cancelled");

  const apiKey =
    method === "dashboard"
      ? await selectDashboardApiKey(callbacks, dependencies, baseUrl)
      : await callbacks.onPrompt({ message: "Enter 9Router API key:" });
  if (!apiKey) throw new Error("9Router API key is required");

  await validateApiKey(dependencies, baseUrl, apiKey);
  await dependencies.saveBaseUrl(baseUrl);

  return {
    access: apiKey,
    refresh: "static-api-key",
    expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
  };
}
