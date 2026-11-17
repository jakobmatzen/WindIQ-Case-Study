import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer boundaries from docs/ARCHITECTURE.md. Each entry lists what a layer
 * must not import. Cross-layer imports use the `@/` alias, so these patterns
 * catch them.
 */
const forbidden = {
  core: [
    "@/db",
    "@/sources",
    "@/worker",
    "@/server",
    "@/app",
    "@/components",
    "next",
    "react",
    "drizzle-orm",
    "postgres",
  ],
  sources: ["@/db", "@/worker", "@/server", "@/app", "@/components"],
  db: ["@/sources", "@/worker", "@/server", "@/app", "@/components"],
  server: ["@/sources", "@/worker", "@/app", "@/components"],
  app: ["@/db", "@/sources", "@/worker"],
  components: ["@/db", "@/sources", "@/worker", "@/server"],
};

const layerRules = Object.entries(forbidden).map(([layer, modules]) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: modules.map((name) => ({
          group: [name, `${name}/**`],
          message: `src/${layer} must not import ${name} (see docs/ARCHITECTURE.md).`,
        })),
      },
    ],
  },
}));

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
