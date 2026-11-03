// ZONA SUL — área e escala (uma fonte só pras ferramentas). Mudar aqui = refazer o mapa.
// Área (Pedro 28/10): a oeste um pouco depois da Pedra da Gávea (−43,285) · a leste a descida de Botafogo ·
// ao sul o mar na frente do Arpoador/Leblon · ao norte o Cristo (−22,952) com folga pro maciço.
// Pedro 28/10 (2º recorte, vendo de cima): "o que importa é do Dois Irmãos pra frente" (o maciço atrás da Gávea era
// muito acidentado) + o Leme estava "comido" e faltava Urca/Pão de Açúcar → oeste no Vidigal, leste depois do Pão de Açúcar.
// 5º ajuste (Pedro 28/10): mar ~60% menor (sul −22,993, leste −43,151) e Botafogo até o começo do Flamengo (norte −22,932).
// 6º (Pedro 28/10): "tirou morro, tirou 2 Irmãos — voltar como estava; só ESTENDER até a água, o resto não remover".
// Sem corte nenhum dentro do mapa: sul −22,993 (mar menor, pedido), leste −43,147 (Pão de Açúcar inteiro), norte −22,932
// (Botafogo → começo do Flamengo, pedido). A terra que chega na borda CONTINUA pra fora numa faixa nova (APRON) descendo
// até a água — nada do que existe é cortado nem rebaixado.
export const BBOX = { s: -22.993, w: -43.252, n: -22.932, e: -43.147 };
/** O recorte de 28/10 (o mapa que o jogo tinha até 02/11). A EXPANSÃO (abaixo) cresce pra oeste e pro sul ALINHADA à
 *  grade dele: o pixel antigo continua no mesmo lugar, com o mesmo (0, 0) no jogo — nada do que existe anda. */
export const BBOX_V1 = BBOX;
/** EXPANSÃO (02/11, Pedro: "abrir até a Pedra da Gávea e fazer aparecer as Ilhas Cagarras, sem bugar nada"): oeste
 *  até depois da Pedra da Gávea (−43,2847) e sul até as Cagarras. Arredonda pra fora no pixel da grade antiga. */
export const EXPAND_TO = { w: -43.298, s: -23.045 };
/** MACIÇO DA TIJUCA (02/11 noite, Pedro vendo o mapa de cima: "aquela parte vazia estranha — põe o Alto da Boa Vista,
 *  a descida pra Tijuca e beira de praia igual o restante"). Até então a faixa oeste só entrava ao sul de −22,972 (o
 *  maciço ficava fora — 28/10: "muito acidentado") e o vazio virava um PAREDÃO descendo pro mar. Agora a faixa oeste entra
 *  INTEIRA (Pico da Tijuca ~200 m no jogo, Bico do Papagaio, Alto da Boa Vista — platô a ~72 m). A borda norte dele
 *  ainda é morro (70–110 m no jogo) → a grade cresce NORTH_PX pro norte só pra uma DESCIDA LONGA até a praia (no lado
 *  oeste: altura × k, até `max` m; no resto da borda norte, a descida de sempre). Nada do mapa de 28/10 muda. */
export const NORTH_PX = 64;
export const NORTH_DESCENT = { k: 2.4, max: NORTH_PX * 4 - 14, blendPx: 24 };
/** ILHAS CAGARRAS mais altas (02/11, Pedro: "ilhas mais altas"): o relevo de 30 m do satélite achata ilha pequena (Ilha
 *  Cagarra ~14 m no jogo; Palmas ~4 m). Como o Cristo (PEAK_BOOST) e a Pedra do Arpoador: realce SÓ dentro do contorno
 *  de cada ilha do arquipélago (pela costa do OSM), pra aparecerem de Ipanema. Fora do recorte antigo (nada dele muda). */
export const ISLAND_BOOST = { k: 1.7, names: ['Ilha Cagarra', 'Ilha das Palmas', 'Ilha Comprida', 'Ilhota Cagarra', 'Ilhota Grande', 'Ilhota Pequena', 'Laje da Cagarra'] };
/** ILHAS MAIORES COM TERRAÇO (02/11 noite, Pedro: "as ilhas podem ter mais área plana e espaço pra andar, tão
 *  pequenas"): cada ilha do arquipélago cresce `s`× em volta do centro (mesma forma; ~s² de área) e ganha, em volta do
 *  morro, um TERRAÇO plano a `plateau` m: areia na borda (`beachPx`), sobe em `risePx` e fica plano até o morro. O morro
 *  fica QUASE do tamanho original no meio (`peakS`× — se espalhasse junto, o plano era pouco: Cagarra só 464 m²). O pico
 *  (com o realce acima) continua no meio, na mesma altura. O mar em volta ganha rampa rasa (`shelfPx`). Fora do mapa
 *  antigo (nada dele muda). */
export const ISLAND_GROW = { s: 2.2, peakS: 1.1, plateau: 3.5, beachPx: 1, risePx: 2, shelfPx: 6 }; // terraço a 3,5 m, rampa ~23° (sobe andando)
/** Faixa NOVA em volta do mapa (px de 4 m): a terra da borda desce por ela até uma praia e o mar. */
export const APRON_PX = 18;
/** Largura (m no jogo) da praia no pé da descida. */
export const ISLAND_BEACH = 10;
/** Ajustes de MARCO (altura do jogo): o Cristo um pouco mais alto (Pedro: "subir mais um pouco sem perder o formato");
 *  a Pedra do Arpoador (16 m reais → 3 m no jogo) vira uma pedra que se vê (~7 m). */
export const PEAK_BOOST = { Corcovado: 1.12 };
// Pedro 28/10: "a pedra do Arpoador um pouco mais alta e mais pra dentro do mar" → 7 → 10 m e +30 m mar adentro
export const ROCK_LANDMARKS = [{ name: 'Pedra do Arpoador', height: 10, extendSea: 30 }];
/** CANAL DO JARDIM DE ALAH NAVEGÁVEL (Pedro 01/11: "mais fundo, mais água pra passar o navio — não precisa arrombar, passa
 *  um navio por vez com uma sobrinha normal boa"). Era 1 célula (4 m) com < 1 m de água e a boca fechada por areia.
 *  Eixo (coordenadas do jogo, x leste, z sul) do MEIO da Lagoa → lóbulo sudoeste (entre a margem e a ilha) → entre as
 *  duas avenidas do Jardim de Alah → praia → mar fundo. Perfil atravessado: fundo chato de `bottom` m até `flat` m do
 *  eixo, depois sobe `slope` m por m (parede de canal) até encontrar o chão — só ABAIXA (nunca levanta nada fora).
 *  Navio (casco 7,7 m de boca, precisa de 3,2 m de água): fundura 3,2 a ±6 m do eixo = ~12 m navegáveis, ~2 m de folga
 *  de cada lado; a água aparece até ±~8 m (a 1ª versão, rampa 1,45, mostrava ~20 m — a grade de 4 m alarga a rampa
 *  rasa; parede mais em pé = mesma largura pro navio, menos avenida comida). A rua some onde virou água. */
// 3º número de cada ponto = largura EXTRA (m, de cada lado) ali, variando ao longo do trecho. 2ª versão (Pedro 01/11: "tô
// encalhando na entrada do canal"): BOCA EM FUNIL nas duas pontas — no mar abre da linha d'água (z 378) até +16 m onde o
// mar já é fundo (z 400; medido: entre os dois o mar tem 1–3 m); na Lagoa abre desde a saída do canal (z 262) — +4 m no
// lóbulo (sem encostar na ilha dos Caiçaras, x ≥ −192) até +12 m no meio. O trecho estreito (avenidas e areia) fica igual.
// 3ª (Pedro 01/11: "navio 15% maior e a lateral do canal afundar um pouco mais"): fundo chato 3,7 → 5 m de cada lado do
// eixo (casco agora 8,8 m de boca: ~15 m navegáveis, ~3 m de folga de cada lado).
export const CANAL_ALAH = {
  path: [[-180, 150, 12], [-200, 200, 9], [-206, 240, 4], [-205, 262, 0], [-205, 268, 0], [-205, 280, 0], [-223, 340, 0], [-223, 372, 0], [-223, 378, 0], [-224, 400, 16], [-224, 430, 16]],
  bottom: 10, flat: 5.0, slope: 3.0,
};
/** LAGOA Rodrigo de Freitas: fundura cresce `LAGOA_SLOPE` m por m da margem, até `LAGOA_MAX_DEPTH`. 1ª (01/11): máx.
 *  3 → 5 (o meio navegável). 2ª (Pedro 01/11: "afundar a Lagoa TODA pro barco navegar"): 0,1 → 0,3 m por m e máx. 6 —
 *  dá 3,2 m (o navio) a ~10 m da margem (antes ~29 m). Laguinhos/represas seguem como eram (0,1 por m, máx. 3). */
export const LAGOA_MAX_DEPTH = 6;
export const LAGOA_SLOPE = 0.3;
/** Relevo: tiles terrarium z14 (~9,6 m por pixel aqui; a origem SRTM é ~30 m). */
export const DEM_Z = 14;
/** Escala horizontal do jogo: 1 m no jogo = SCALE m reais. Pedro 28/10: 1º "15 min pra atravessar" → 1:3; depois de
 *  jogar: "diminuir uns 35–40%, é grande" → 1:4,8 (−37,5%; 12,3 km → ~2,6 km; correndo ≈ 10 min). Mapa INTEIRO
 *  encolhido (nada cortado); árvores no mesmo tamanho e na mesma densidade. */
export const SCALE = 7.4;
/** Exagero da ALTURA em relação à escala horizontal. 3º ajuste (Pedro 28/10): "reduzir mais uns 35%, mantendo a
 *  altura boa das montanhas" → 1:7,4 com altura ×1,5 (≈ a altura que tinha em 1:4,8: Corcovado ~144 m no jogo). */
export const RELIEF = 1.5;
/** Picos conhecidos (altitude oficial aproximada, m) pra conferir o relevo baixado. */
export const PEAKS = [
  { nome: 'Pedra da Gávea', lat: -22.9974, lon: -43.2847, alt: 844 },
  { nome: 'Corcovado (Cristo)', lat: -22.9519, lon: -43.2105, alt: 710 },
  { nome: 'Dois Irmãos', lat: -22.9878, lon: -43.2410, alt: 533 },
  { nome: 'Morro do Cantagalo', lat: -22.9790, lon: -43.1990, alt: 140 },
  { nome: 'Pão de Açúcar', lat: -22.9488, lon: -43.1567, alt: 396 },
];
