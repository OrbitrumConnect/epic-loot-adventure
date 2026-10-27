import { defineConfig } from 'nitro';

export default defineConfig({
  routeRules: {
    // Os GLB nao levam hash no nome (diferente de /assets/*, que o Vite renomeia a cada
    // mudanca). Por isso nada de `immutable`: um dia de cache corta o re-download de toda
    // visita e ainda deixa um modelo trocado chegar no jogador no dia seguinte.
    '/models/**': {
      headers: { 'cache-control': 'public, max-age=86400' },
    },
  },
});
