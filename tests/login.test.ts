import assert from "node:assert/strict";
import test from "node:test";
import { loginNineRouter } from "../src/login.ts";

function response(body: unknown, options: { ok?: boolean; status?: number; setCookie?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: options.setCookie ? { "set-cookie": options.setCookie } : undefined,
  });
}

test("direct key login validates remote URL and persists only public URL", async () => {
  const calls: { url: string; headers?: HeadersInit }[] = [];
  const saved: string[] = [];
  const credential = await loginNineRouter(
    {
      onPrompt: async ({ message }) =>
        message.includes("URL") ? "https://router.example.com/" : "sk-direct",
      onSelect: async () => "direct",
    },
    {
      defaultBaseUrl: "http://localhost:20128",
      saveBaseUrl: (url) => saved.push(url),
      fetch: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers });
        return response({ data: [] });
      },
    },
  );

  assert.equal(calls[0].url, "https://router.example.com/v1/models");
  assert.equal(new Headers(calls[0].headers).get("authorization"), "Bearer sk-direct");
  assert.deepEqual(saved, ["https://router.example.com"]);
  assert.equal(credential.access, "sk-direct");
  assert.notEqual(credential.refresh, "sk-direct");
  assert.ok(credential.expires > Date.now());
});

test("dashboard key selection does not retain dashboard password", async () => {
  const requests: { url: string; body?: string }[] = [];
  const credential = await loginNineRouter(
    {
      onPrompt: async ({ message }) => (message.includes("password") ? "dashboard-secret" : ""),
      onSelect: async ({ message }) => (message.includes("method") ? "dashboard" : "key-1"),
    },
    {
      defaultBaseUrl: "http://localhost:20128",
      saveBaseUrl: () => {},
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: init?.body as string | undefined });
        if (String(url).endsWith("/api/auth/login")) {
          return response({}, { setCookie: "auth_token=temporary-cookie; Path=/" });
        }
        if (String(url).endsWith("/api/keys")) {
          return response({ keys: [{ id: "key-1", name: "Primary", key: "sk-dashboard", isActive: true }] });
        }
        return response({ data: [] });
      },
    },
  );

  assert.equal(credential.access, "sk-dashboard");
  assert.equal(JSON.stringify(credential).includes("dashboard-secret"), false);
  assert.equal(requests.filter((request) => request.body?.includes("dashboard-secret")).length, 1);
});

test("failed API key validation rejects without saving URL", async () => {
  let saved = false;
  await assert.rejects(
    loginNineRouter(
      {
        onPrompt: async ({ message }) => (message.includes("URL") ? "http://router.invalid" : "sk-bad"),
        onSelect: async () => "direct",
      },
      {
        defaultBaseUrl: "http://localhost:20128",
        saveBaseUrl: () => {
          saved = true;
        },
        fetch: async () => response({ error: "invalid key" }, { status: 401 }),
      },
    ),
    /API key validation failed: 401/,
  );
  assert.equal(saved, false);
});
