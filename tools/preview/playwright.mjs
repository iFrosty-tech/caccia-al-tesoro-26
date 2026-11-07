// Finds Playwright for the preview tools: a local install (npm install --no-save playwright at
// the repo root) or a global one (npm install -g playwright). The site itself has no
// dependencies, so neither is part of the repository.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);

function load() {
  try {
    return require("playwright");
  } catch (_) {}
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return require(path.join(globalRoot, "playwright"));
  } catch (_) {}
  console.error(
    "Playwright non trovato. Dalla cartella del repository:\n" +
      "  npm install --no-save playwright\n" +
      "  npx playwright install chromium"
  );
  process.exit(1);
}

export const { chromium } = load();
