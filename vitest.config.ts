import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    /* Os testes que fazem `await import()` de módulo do mundo 3D pagam a compilação do módulo inteiro:
       14,5 s só pro game-world rodando quase sozinho. Na suíte cheia (paralela) a disputa de CPU
       multiplicou isso por 2,8x no caso medido (lista-bichos-estavel: 7,4 s sozinho, 20,5 s na suíte),
       e aí os limites de 20 s/30 s espalhados pelos arquivos estouravam de vez em quando. Um limite só,
       aqui, com folga pra máquina ocupada. Teste rápido continua acabando em milissegundos. */
    testTimeout: 120_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
