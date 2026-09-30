import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepository } from "../scripts/repository-scanner.mjs";

test("Scanner returns references and never dotenv values or source text", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "credential-registry-scanner-"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "node_modules", "package"), { recursive: true });
  await writeFile(path.join(root, ".env.local"), "GEMINI_API_KEY=not-a-real-secret-value-123456\n");
  await writeFile(path.join(root, "src", "app.ts"), "const key = process.env.GEMINI_API_KEY;\nconst id = process.env['CLIENT_ID'];\n");
  await writeFile(path.join(root, "node_modules", "package", "ignored.js"), "process.env.SHOULD_NOT_APPEAR");

  const result = await scanRepository(root);
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.findings.map((item) => item.variableName), ["GEMINI_API_KEY", "CLIENT_ID"]);
  assert.ok(result.findings.every((item) => item.sourcePath === "src/app.ts"));
  assert.doesNotMatch(serialized, /not-a-real-secret-value-123456|SHOULD_NOT_APPEAR|const key/);
  assert.ok(result.excludedPaths.includes(".env*"));
});
