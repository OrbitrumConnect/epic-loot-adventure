// Service worker MÍNIMO do TRIBOS (PWA instalável). Sem cache e sem interceptar pedidos, de
// propósito: o jogo atualiza várias vezes por dia e cada deploy tem que chegar na hora.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
