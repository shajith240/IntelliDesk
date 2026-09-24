import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layering: app -> features -> shared (components, hooks, lib, types). Server code
// (src/server) is reachable only from route handlers, server pages and middleware.
const serverImport = {
  group: ["@/server", "@/server/*"],
  message: "Server-only module. Import it from src/app (route handlers, server pages), src/server or middleware.",
};
const featureImport = {
  group: ["@/features", "@/features/*"],
  message: "Shared code must not depend on a feature. Move the shared piece into components/, hooks/ or lib/.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/**", "src/hooks/**", "src/lib/**", "src/types/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [serverImport, featureImport] }] },
  },
  {
    files: ["src/features/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [serverImport] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
