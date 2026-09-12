import { defineConfig, globalIgnores } from "eslint/config";
import nextTs from "eslint-config-next/typescript";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Estos dos workers usan el runtime de Deno, fuera del compilador de Next.
    files: ["supabase/functions/rag-index/index.ts", "supabase/functions/rag-search/index.ts"],
    rules: { "@typescript-eslint/ban-ts-comment": ["error", { "ts-nocheck": "allow-with-description" }] },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "data/**"]),
]);
