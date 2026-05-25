/**
 * E2E tests for pi-9router extension.
 * Requires 9Router running at NINE_ROUTER_URL (default localhost:20128).
 *
 * Run: npx tsx test.ts
 */

const BASE_URL = process.env.NINE_ROUTER_URL ?? "http://localhost:20128";
const PASSWORD = process.env.NINE_ROUTER_PASSWORD ?? "@Indra290997";
const API_KEY = process.env.NINE_ROUTER_API_KEY ?? "";

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
  if (data.choices?.[0]?.message?.content) ok(`v1/chat/completions (got response)`);
  else fail("v1/chat/completions", JSON.stringify(data).slice(0, 150));
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

// --- Run ---

async function main() {
  console.log(`\n9Router E2E Tests — ${BASE_URL}\n`);

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

  console.log("\n── OpenAI-compatible API (api key) ──");
  await testModelsEndpoint();
  await testWebModels();
  await testImageModels();
  await testChatCompletion();

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
