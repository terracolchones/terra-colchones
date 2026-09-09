import { defineConfig } from "vitest/config";

// Ejecuta únicamente las pruebas de Terra. Evita que una carpeta temporal de
// dependencias sea tomada como parte de la suite de la aplicación.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
