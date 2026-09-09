import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Ejecuta únicamente las pruebas de Terra. Evita que una carpeta temporal de
// dependencias sea tomada como parte de la suite de la aplicación.
export default defineConfig({
  resolve: {
    // Next resuelve server-only durante build; Vitest necesita un módulo vacío
    // para probar la lógica de servidor sin incluirla en el navegador.
    alias: { "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
