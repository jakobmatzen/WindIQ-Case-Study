import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer boundaries from docs/ARCHITECTURE.md ("May import" column).
 * Every layer may import itself and what is listed here; everything else is an error,
 * whether imported via `@/layer` or a relative `../layer` path.
 * Keep this map and the table in ARCHITECTURE.md in sync.
 */
const mayImport = {
  core: ["lib"],
  sources: ["core", "lib"],
  db: ["core", "lib"],
  worker: ["sources", "core", "db", "lib"],
  server: ["db", "core", "lib"],
  app: ["server", "components", "core", "lib"],
  components: ["core", "lib"],
  lib: [],
};

/** External modules that would bring I/O or a framework into the pure core. */
const coreForbiddenModules =
  "^(next|react|react-dom|server-only|drizzle-orm|postgres)(/.*)?$|" +
  "^(node:.*|fs|fs/promises|net|http|https|http2|child_process|dns|tls|dgram|cluster|worker_threads)$";

const layers = Object.keys(mayImport);

const layerRules = layers.map((layer) => {
  const forbidden = layers.filter((other) => other !== layer && !mayImport[layer].includes(other));
  const patterns = forbidden.map((other) => ({
    regex: `^(@/|(\\.\\./)+)${other}(/.*)?$`,
    message: `src/${layer} must not import src/${other} (see docs/ARCHITECTURE.md).`,
  }));
  if (layer === "core") {
    patterns.push({
      regex: coreForbiddenModules,
      message: "src/core stays pure: no I/O and no framework (see docs/ARCHITECTURE.md).",
    });
  }
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: { "no-restricted-imports": ["error", { patterns }] },
  };
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bundled worker output (`bun run build:worker`).
    "dist/**",
  ]),
]);

export default eslintConfig;
