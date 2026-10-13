// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { ConfigEnv, PluginOption, UserConfig } from "vite";

// O TanStack Devtools (embutido no config acima) injeta `data-tsd-source` em cada
// elemento JSX para a feature "Go to Source". O React Three Fiber quebra ao receber
// esse atributo num objeto 3D (<mesh>/<group>), derrubando o canvas inteiro no dev.
// Removemos só esse plugin (dev-only); build de produção não é afetada.
const INJECT_SOURCE_PLUGIN = "@tanstack/devtools:inject-source";

function stripInjectSource(plugins: PluginOption[] | undefined): PluginOption[] | undefined {
  if (!Array.isArray(plugins)) return plugins;
  return plugins
    .map((p) => (Array.isArray(p) ? stripInjectSource(p) : p))
    .filter(
      (p) =>
        !(p && typeof p === "object" && "name" in p && (p as { name?: string }).name === INJECT_SOURCE_PLUGIN),
    ) as PluginOption[];
}

const base = defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: { port: 8000 },
  },
});

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const cfg = await base(env);
  if (Array.isArray(cfg.plugins)) {
    cfg.plugins = stripInjectSource(cfg.plugins) as PluginOption[];
  }
  return cfg;
};
