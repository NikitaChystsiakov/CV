import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Локальные папки агентов (в .gitignore): в них бывают целые рабочие
    // копии проекта — git worktree с чужими node_modules и сборками
    ".claude/**",
  ]),
]);

export default eslintConfig;
