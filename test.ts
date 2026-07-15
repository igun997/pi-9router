/**
 * E2E tests for pi-9router extension.
 * Requires explicit credentials for authenticated coverage.
 *
 * Run: NINEROUTER_URL=http://localhost:20128 NINEROUTER_KEY=sk-... npx tsx test.ts
 */

const BASE_URL = process.env.NINEROUTER_URL ?? process.env.NINE_ROUTER_URL ?? "http://localhost:20128";
const PASSWORD = process.env.NINE_ROUTER_PASSWORD ?? "";
const API_KEY = process.env.NINEROUTER_KEY ?? process.env.NINE_ROUTER_API_KEY ?? "";
const CX_VISION_MODEL = process.env.NINEROUTER_E2E_CX_VISION_MODEL ?? "";
const CX_IMAGE_MODEL = process.env.NINEROUTER_E2E_CX_IMAGE_MODEL ?? "";
const RUN_IMAGE_E2E = process.env.NINEROUTER_E2E_RUN_IMAGE === "true";

let authToken = "";
let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function fail(name: string, err: string) {
  failed++;
  console.log(`  ✗ ${name}: ${err}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/auth_token=([^;]+)/);
  return match?.[1] ?? "";
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (authToken) h.Cookie = `auth_token=${authToken}`;
  return h;
}

function apiKeyHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h.Authorization = `Bearer ${API_KEY}`;
  return h;
}

// --- Tests ---

async function testHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  const data = await res.json();
  if (data.ok) ok("health");
  else fail("health", JSON.stringify(data));
}

async function testLogin() {
  authToken = await login();
  if (authToken) ok("login (got auth_token)");
  else fail("login", "no token returned");
}

async function testAuthStatus() {
  const res = await fetch(`${BASE_URL}/api/auth/status`, { headers: authHeaders() });
  const data = await res.json();
  if (data.authMode) ok(`auth/status (mode=${data.authMode})`);
  else fail("auth/status", JSON.stringify(data));
}

async function testProviders() {
  const res = await fetch(
    `${BASE_URL}/api/providers/client?page=1&pageSize=50&accountStatus=all&sort=priority`,
    { headers: authHeaders() }
  );
  const data = await res.json();
  if (Array.isArray(data.connections) && data.connections.length > 0) {
    ok(`providers (${data.connections.length} connections)`);
    return data.connections;
  } else {
    fail("providers", "no connections");
    return [];
  }
}

async function testUsage(connections: any[]) {
  const active = connections.filter((c: any) => c.isActive);
  if (active.length === 0) {
    fail("usage", "no active providers to test");
    return;
  }

  for (const conn of active.slice(0, 3)) {
    const res = await fetch(`${BASE_URL}/api/usage/${conn.id}`, { headers: authHeaders() });
    const data = await res.json();
    if (data.quotas || data.plan) {
      ok(`usage/${conn.provider}/${conn.name} (plan=${data.plan})`);
    } else {
      fail(`usage/${conn.provider}/${conn.name}`, JSON.stringify(data).slice(0, 100));
    }
  }
}

async function testProviderTest(connections: any[]) {
  const active = connections.filter((c: any) => c.isActive && c.testStatus === "active");
  if (active.length === 0) {
    fail("provider/test", "no active+healthy providers");
    return;
  }

  const target = active[0];
  const res = await fetch(`${BASE_URL}/api/providers/${target.id}/test`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json();
  if (data.valid === true) ok(`provider/test (${target.provider}/${target.name})`);
  else fail(`provider/test (${target.provider}/${target.name})`, JSON.stringify(data));
}

async function testModelAliases() {
  const res = await fetch(`${BASE_URL}/api/models/alias`, { headers: authHeaders() });
  const data = await res.json();
  const count = Object.keys(data.aliases ?? data).length;
  if (count > 0) ok(`model/aliases (${count} aliases)`);
  else fail("model/aliases", "empty");
}

async function testSettings() {
  const res = await fetch(`${BASE_URL}/api/settings`, { headers: authHeaders() });
  const data = await res.json();
  if ("cloudEnabled" in data || "providerStrategies" in data) ok("settings");
  else fail("settings", JSON.stringify(data).slice(0, 100));
}

async function testApiKeys() {
  const res = await fetch(`${BASE_URL}/api/keys`, { headers: authHeaders() });
  const data = await res.json();
  if (Array.isArray(data.keys)) ok(`api/keys (${data.keys.length} keys)`);
  else fail("api/keys", JSON.stringify(data).slice(0, 100));
}

async function testModelsEndpoint() {
  const res = await fetch(`${BASE_URL}/v1/models`, { headers: apiKeyHeaders() });
  const data = await res.json();
  if (Array.isArray(data.data) && data.data.length > 0) ok(`v1/models (${data.data.length} models)`);
  else fail("v1/models", JSON.stringify(data).slice(0, 100));
}

async function testChatCompletion() {
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: apiKeyHeaders(),
    body: JSON.stringify({
      model: "openrouter/openrouter/free",
      messages: [{ role: "user", content: "Say hi in 3 words" }],
      max_tokens: 20,
      stream: false,
    }),
  });
  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (res.ok && (typeof message?.content === "string" || typeof message?.reasoning === "string")) {
    ok(`v1/chat/completions (got response)`);
  } else fail("v1/chat/completions", JSON.stringify(data).slice(0, 150));
}

async function testWebModels() {
  const res = await fetch(`${BASE_URL}/v1/models/web`, { headers: apiKeyHeaders() });
  const data = await res.json();
  if (Array.isArray(data.data)) ok(`v1/models/web (${data.data.length} web models)`);
  else fail("v1/models/web", "not array");
}

async function testImageModels() {
  const res = await fetch(`${BASE_URL}/v1/models/image`, { headers: apiKeyHeaders() });
  const data = await res.json();
  if (Array.isArray(data.data)) ok(`v1/models/image (${data.data.length} image models)`);
  else fail("v1/models/image", "not array");
}

async function testCxVisionAndGeneration() {
  if (!RUN_IMAGE_E2E) {
    console.log("  - cx image E2E skipped (set NINEROUTER_E2E_RUN_IMAGE=true with explicit cx model IDs)");
    return;
  }
  if (!API_KEY || !CX_VISION_MODEL || !CX_IMAGE_MODEL) {
    fail("cx image E2E", "requires NINEROUTER_KEY, NINEROUTER_E2E_CX_VISION_MODEL, and NINEROUTER_E2E_CX_IMAGE_MODEL");
    return;
  }
  if (!CX_VISION_MODEL.startsWith("cx/") || !CX_IMAGE_MODEL.startsWith("cx/")) {
    fail("cx image E2E", "vision and image model IDs must use cx/; provider fallback is forbidden");
    return;
  }

  const vision = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: apiKeyHeaders(),
    body: JSON.stringify({
      model: CX_VISION_MODEL,
      stream: false,
      max_tokens: 32,
      messages: [{ role: "user", content: [
        { type: "text", text: "Reply with image received." },
        { type: "image_url", image_url: { url: "https://placehold.co/2x2.png" } },
      ] }],
    }),
  });
  if (vision.ok) ok(`cx vision (${CX_VISION_MODEL})`);
  else fail("cx vision", `${vision.status}: ${await vision.text()}`.slice(0, 240));

  const generated = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: apiKeyHeaders(),
    body: JSON.stringify({ model: CX_IMAGE_MODEL, prompt: "minimal cyan dot on white background", n: 1 }),
  });
  const image = await generated.json();
  if (generated.ok && Array.isArray(image.data) && image.data.length > 0) ok(`cx image generation (${CX_IMAGE_MODEL})`);
  else fail("cx image generation", `${generated.status}: ${JSON.stringify(image)}`.slice(0, 240));
}

// --- Run ---

async function main() {
  console.log(`\n9Router E2E Tests — ${BASE_URL}\n`);

  if (PASSWORD) {
    console.log("── Admin API (password auth) ──");
    await testHealth();
    await testLogin();
    await testAuthStatus();
    const connections = await testProviders();
    await testUsage(connections);
    await testProviderTest(connections);
    await testModelAliases();
    await testSettings();
    await testApiKeys();
  } else {
    console.log("── Admin API skipped (set NINE_ROUTER_PASSWORD) ──");
  }

  if (API_KEY) {
    console.log("\n── OpenAI-compatible API (api key) ──");
    await testModelsEndpoint();
    await testWebModels();
    await testImageModels();
    await testChatCompletion();
    await testCxVisionAndGeneration();
  } else {
    console.log("\n── OpenAI-compatible API skipped (set NINEROUTER_KEY) ──");
  }

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
