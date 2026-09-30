import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("Credential Registryを日本語で表示する", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Credential Registry<\/title>/i);
  assert.match(html, /開発環境の認証情報台帳/);
  assert.match(html, /要確認/);
  assert.match(html, /メタデータのみ/);
  assert.match(html, /今やること/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});
