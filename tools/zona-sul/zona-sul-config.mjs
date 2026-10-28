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
/** Faixa NOVA em volta do mapa (px de 4 m): a terra da borda desce por ela até uma praia e o mar. */
export const APRON_PX = 18;
/** Largura (m no jogo) da praia no pé da descida. */
export const ISLAND_BEACH = 10;
/** Ajustes de MARCO (altura do jogo): o Cristo um pouco mais alto (Pedro: "subir mais um pouco sem perder o formato");
 *  a Pedra do Arpoador (16 m reais → 3 m no jogo) vira uma pedra que se vê (~7 m). */
export const PEAK_BOOST = { Corcovado: 1.12 };
export const ROCK_LANDMARKS = [{ name: 'Pedra do Arpoador', height: 7 }];
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
