import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer boundaries from docs/ARCHITECTURE.md ("May import" column).
 * Every layer may import itself and the layers listed here; any other layer is an error,
 * whether imported via `@/layer` or a relative `../layer` path.
 * `externals` bans npm packages; `pure` also bans every Node built-in and Bun's runtime API.
 * Keep this map and the table in ARCHITECTURE.md in sync.
 */
const framework = ["next", "react", "react-dom", "server-only"];
const database = ["drizzle-orm", "postgres"];

const layers = {
  core: { mayImport: ["lib"], externals: [...framework, ...database], pure: true },
  sources: { mayImport: ["core", "lib"], externals: [...framework, ...database] },
  db: { mayImport: ["core", "lib"], externals: framework },
  worker: { mayImport: ["sources", "core", "db", "lib"], externals: framework },
  server: { mayImport: ["db", "core", "lib"], externals: database },
  app: { mayImport: ["server", "components", "core", "lib"], externals: database },
  components: { mayImport: ["core", "lib"], externals: [...database, "server-only"] },
  lib: { mayImport: [], externals: [...framework, ...database], pure: true },
};

const names = Object.keys(layers);

const layerRules = Object.entries(layers).map(([layer, { mayImport, externals, pure }]) => {
  const forbiddenLayers = names.filter((other) => other !== layer && !mayImport.includes(other));
  const patterns = [
    ...forbiddenLayers.map((other) => ({
      regex: `^(@/|(\\.\\./)+)${other}(/.*)?$`,
      message: `src/${layer} must not import src/${other} (see docs/ARCHITECTURE.md).`,
    })),
    ...externals.map((name) => ({
      regex: `^${name}(/.*)?$`,
      message: `src/${layer} must not import ${name} (see docs/ARCHITECTURE.md).`,
    })),
  ];
  if (pure) {
    // Bun's runtime API is I/O; `bun:test` stays allowed for tests.
    patterns.push({
      regex: "^bun(:(?!test$).*)?$",
      message: `src/${layer} stays pure: no I/O (see docs/ARCHITECTURE.md).`,
    });
  }
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": ["error", { patterns }],
      ...(pure && { "import/no-nodejs-modules": "error" }),
    },
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
