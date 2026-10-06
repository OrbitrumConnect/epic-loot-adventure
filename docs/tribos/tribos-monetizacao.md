---
name: tribos-monetizacao
description: "Economia premium do TRIBOS — F2P, diamantes, skins, pets, cosméticos de base/criaturas, Pix via Google Play, sem pay-to-win, sem saque."
metadata:
  node_type: memory
  type: project
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
  modified: 2026-10-06T16:03:30.251Z
---

# TRIBOS — Economia e Monetização

## Modelo
Free-to-play. Dinheiro compra expressão, o jogo conquista poder.

## 3 Camadas econômicas
1. **Mundial** — Ouro + recursos + itens + equipamentos (jogadores movem)
2. **Tribo** — Armazém, produção, construção, FOB, guerra
3. **Premium** — Diamantes (moeda premium comprada com dinheiro real)

## Diamantes (preços ponto de partida)
R$4,90→500 / R$9,90→1100 / R$19,90→2400 / R$49,90→6500 / R$99,90→14000

## O que Diamante compra
Skins, pets cosméticos, armas cosméticas, decoração de base, aparências de criaturas,
emotes, banners, títulos, passe de temporada, bundles, slots extras.

## O que NÃO se vende
+dano, armadura impossível jogando, criatura PvP exclusiva, recurso infinito,
território, vitória em raid, proteção absoluta, progressão absurda.

## Pix
Pix é método oficial no Google Play BR. Não criar sistema Pix direto.
Arquitetura: TRIBOS Shop → Payment Service → Google Play/App Store/Web → Webhook → Game Server → credit diamonds → Supabase.
NUNCA: cliente dizendo "eu paguei".

## Diamante→Pix entre jogadores: NÃO
Abre fraude, chargeback, bots, lavagem, mercado paralelo, problemas regulatórios.

## Oportunidades de monetização cosmética
- Base: Fortaleza Élfica/Demoníaca/Congelada/Oriental/Arcana (mesma função, outro visual)
- Criaturas: Wolf → Spectral/Infernal/Ice/Golden/Ancient Wolf
- Pacotes: Starter/Explorer/Tribe/Founder Pack
- Temporadas: free track + premium track (sem vantagem absurda)

## Tabelas futuras (Supabase)
accounts, players, wallets, diamond_transactions, purchases, products, entitlements, shop_items, orders, payment_events, refunds, promotions

**Why:** monetização precisa estar na arquitetura desde o início, não enfiada depois.
**How to apply:** quando chegar no Bloco 10 (persistência), já prever schema de economia premium.
