import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const SCANNER_VERSION = "metadata-only-1";

const IGNORED_DIRECTORIES = new Set([
  ".git", ".next", ".vinext", ".wrangler", "__tests__", "build", "coverage", "dist", "fixtures", "node_modules", "out", "tests",
]);
const IGNORED_FILE_NAMES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx", ".yml", ".yaml"]);

const detectors = [
  { kind: "process.env", expression: /\bprocess\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\])/g },
  { kind: "import.meta.env", expression: /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g },
  { kind: "Cloudflare binding", expression: /\bbinding\s*=\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g },
  { kind: "Apps Script property", expression: /\bgetProperty\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\)/g },
  { kind: "GitHub Actions secret", expression: /\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)\b/g },
];

function isDotenv(name) {
  return name === ".env" || name.startsWith(".env.");
}

function isScannableFile(name) {
  return !isDotenv(name) && !IGNORED_FILE_NAMES.has(name) && SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

async function sourceFiles(root, current = root, files = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await sourceFiles(root, path.join(current, entry.name), files);
    } else if (entry.isFile() && isScannableFile(entry.name)) {
      files.push(path.join(current, entry.name));
    }
  }
  return files;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function findingsInFile(root, file, source) {
  const sourcePath = path.relative(root, file).split(path.sep).join("/");
  const found = [];
  for (const detector of detectors) {
    detector.expression.lastIndex = 0;
    for (let match = detector.expression.exec(source); match; match = detector.expression.exec(source)) {
      const variableName = match[1] ?? match[2];
      if (variableName) found.push({ variableName, sourcePath, lineNumber: lineNumber(source, match.index), detector: detector.kind, classification: "INFERRED" });
    }
  }
  return found;
}

function commitFor(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Scans code references only. It never opens dotenv files or emits source text. */
export async function scanRepository(target) {
  const root = path.resolve(target);
  if (!(await stat(root)).isDirectory()) throw new Error(`Repository directory not found: ${root}`);
  const files = await sourceFiles(root);
  const findings = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    findings.push(...findingsInFile(root, file, source));
  }
  return {
    scannerVersion: SCANNER_VERSION,
    repositoryPath: root,
    repositoryCommit: commitFor(root),
    scannedAt: new Date().toISOString(),
    excludedPaths: [".env*", ...[...IGNORED_DIRECTORIES].map((name) => `${name}/`)],
    findings,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/repository-scanner.mjs <repository-path>");
    process.exitCode = 1;
  } else {
    scanRepository(target).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
