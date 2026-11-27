import { existsSync } from "node:fs";
import { register } from "node:module";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// When imported via --import, register self as the ESM resolve hook.
if (!process.env.__RAVANAMA_TS_LOADER_ACTIVE) {
  process.env.__RAVANAMA_TS_LOADER_ACTIVE = "1";
  register(import.meta.url);
}

const srcRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const candidateTs = pathResolve(srcRoot, `${rel}.ts`);
    if (existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
    const candidateIndex = pathResolve(srcRoot, rel, "index.ts");
    if (existsSync(candidateIndex)) {
      return nextResolve(pathToFileURL(candidateIndex).href, context);
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL &&
    !specifier.endsWith(".ts") &&
    !specifier.endsWith(".js") &&
    !specifier.endsWith(".mjs")
  ) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const candidateTs = pathResolve(parentDir, `${specifier}.ts`);
    if (existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
  }

  return nextResolve(specifier, context);
}
