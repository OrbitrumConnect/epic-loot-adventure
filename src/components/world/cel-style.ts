/**
 * Ajustes do acabamento visual Ashland: gradação suave, contorno discreto,
 * atmosfera e bloom. ACES e reflexos PBR são configurados pelo mundo.
 * O modo toon anterior permanece disponível, desativado por padrão.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Bloco de constantes — ajuste TUDO aqui.
 * ------------------------------------------------------------------ */
export const CEL = {
  enabled: true,

  /**
   * Rampa toon por material (degrau duro no terminador). NÃO é a fonte do
   * "fill chapado" nem deve escurecer — isso é trabalho do pós (posterização
   * de luminância). Aqui só marca sombra/meio/cheio preservando energia: a
   * banda CHEIA multiplica o albedo ACIMA de 1 (o sol real multiplica por ~2-3),
   * senão a superfície iluminada ficaria presa no albedo (escuro).
   */
  toon: {
    enabled: false,
    // Brilho de cada degrau (multiplica o albedo). Sombra / meio / cheio.
    // Faixa larga (sombra funda, cheio bem claro) pra alimentar o contraste.
    band0: 0.3,
    band1: 1.0,
    band2: 2.05,
    // Limiares no fator de luz direta [0..1] onde troca de degrau.
    thresh0: 0.3,
    thresh1: 0.66,
    // Suavização mínima da borda do degrau (anti-serrilhado do terminador).
    softness: 0.05,
    // Rebaixa a luz indireta (ambiente) pra AFUNDAR as sombras — sem isso o
    // ambiente ergue tudo pra um mesmo brilho e a cena fica chapada (baixo
    // contraste). É o que dá o terminador duro e o contraste de pôster.
    ambientScale: 0.22,
  },

  /** Contorno escuro por descontinuidade de profundidade (tela cheia). */
  outline: {
    enabled: false,
    color: '#100c0a',      // near-black da paleta
    thickness: 1.0,        // raio da amostra, em pixels (grosso = visível a olho nu)
    threshold: 0.08,       // início da borda (diff de prof. relativa)
    rampEnd: 0.32,         // fim da borda (acima disso = contorno cheio)
    strength: 0.24,
  },

  /**
   * Gradação: posteriza a LUMINÂNCIA em degraus (fill chapado de pôster) e
   * RESTAURA a luminância escalando a cor — assim NÃO escurece e mantém as
   * famílias de cor separadas (vegetação, terra, pedra, metal, água). Depois
   * reforça saturação e aplica um leve calor + ganho. Nada de multiply pesado.
   */
  grade: {
    // O degrau "chapado" já vem do toon por material (rampa de 3 bandas +
    // flatShading). O pós só PRESERVA e realça a distribuição que já chega boa
    // da cena (não re-posteriza pesado, que achatava ou esmagava). Contraste
    // suave em torno do pivô (≈ brilho médio da cena) alarga o desvio pra faixa
    // de pôster; a posterização por canal é fina (muitos níveis), só pra limpar.
    posterSteps: 256,    // níveis POR CANAL (fino: limpa sem achatar)
    contrast: 1.06,      // expande cada canal em torno do pivô (contraste de pôster)
    pivot: 0.46,        // ponto fixo da expansão de contraste (≈ média da cena)
    saturation: 0.94,    // puxa a saturação pra perto da referência (~0.40)
    slope: [1.05, 1.01, 0.95] as [number, number, number],  // calor leve
    offset: [0.02, 0.012, 0.005] as [number, number, number],
    gain: 1.02,         // ganho geral (acerta o brilho médio)
  },

  /** Névoa de cobre: tinge SÓ o fundo distante (horizonte), leve. */
  haze: {
    color: '#edb067',
    start: 38,     // distância (unidades de olho) onde começa
    density: 0.012,
    strength: 0.3,
  },

  /** Vinheta e grão de filme (ambos discretos — não escurecer a cena). */
  vignette: { amount: 0.14, radius: 1.15, softness: 0.7 },
  grain: { amount: 0.004 },

  /**
   * Céu gradeado + banda de distância + sol (fase final — o ar e o céu).
   *
   * MEDIDO NO JOGO (3ª pessoa, 1250x691, 08:05, leitura por `gl.readPixels` no
   * framebuffer da tela):
   *  - 14.0% dos pixels do quadro são FUNDO (`rawDepth >= 0.9999`); no décimo
   *    superior da tela são 94.5%. Ou seja: existe céu de verdade nesta câmera.
   *  - o terreno vai só até ~100 unidades de olho (99% abaixo de 80, 85% abaixo
   *    de 20) — o mapa é pequeno, então a linha do horizonte é fundo, não
   *    terreno distante.
   *
   * Por isso a atmosfera entra por DOIS caminhos somados num peso só (`atm`):
   *  a) pixel de fundo → peso cheio (é o céu);
   *  b) terreno distante → peso parcial (`atmTerrain`) rampando de `atmStart`
   *     a `atmEnd`, só pra matar a costura entre a última crista e o céu. Como
   *     a rampa só começa em `atmStart`, o meio-campo (85% do terreno em quadro
   *     está abaixo de 20 unidades) não é tocado e o contraste fica de pé.
   *
   * Erro da volta anterior (corrigido aqui): o gate tinha um `lum < sunKeep`
   * pra preservar o disco do sol. A luminância do FUNDO já gradeado é ~1.18 em
   * espaço de exibição (contraste 1.4 + ganho 1.32 estouram a faixa), muito
   * acima de 0.72 — então o gate reprovava 13.2% dos 14.0% de fundo e o
   * gradiente nunca pintava nada. Medido: só 0.73% do quadro passava.
   * Agora o disco é preservado por GEOMETRIA (máscara de tela em volta da
   * posição projetada do sol, e só onde o pixel é fundo), não por brilho.
   *
   * O disco do sol continua sendo MALHA na cena (`Sun`, game-world.tsx): o
   * relevo o recorta (depthTest) e o bloom o acende. MEDIDO: com a câmera
   * virada pro sol, o disco cai dentro do quadro em v=0.84 (h19), v=0.93 (h7)
   * e v=0.73 (h17, olhando pra cima) — é alcançável pelo jogador no começo e
   * no fim do dia. Ao meio-dia (elevação 71°) não cabe, e aí só o halo lê.
   * Por isso o halo tem âncora CLAMPADA à borda da tela com queda por distância
   * (`glowFalloff`, calculado em cel-shade.tsx): quando o sol sai do
   * enquadramento o brilho encosta na borda e some conforme ele se afasta.
   *
   * Tudo escala por `uDayFactor` (= 1 - nightFactor): à noite o efeito some e
   * o ciclo do Pedro (fundo + lua) assume sozinho. `enabled=false` desliga.
   */
  sky: {
    enabled: true,
    // O horizonte (baixo, hazy) fica pálido-cobre; o alto do céu, laranja mais
    // saturado. O halo do sol devolve o pálido quente perto do disco.
    // Valores escolhidos por VARREDURA medida (A/B no mesmo quadro, relógio
    // travado em 17.6, 3ª pessoa, tela cheia). O cobre mais saturado que eu
    // tinha antes (#e8b070/#c9793a) custava contraste -11.5 e saturação +0.034
    // — estourava a barra. Este par: contraste -8.0, saturação +0.017
    // (0.478 -> 0.495), e a banda de horizonte sai em RGB [202,150,116],
    // R/B 1.75 contra 1.36 do creme de névoa — cobre de verdade, sem lavar.
    horizonColor: '#dfc8ab',   // banda pálida de cobre no horizonte (haze)
    highColor: '#819a9f',      // cobre mais fundo no alto do céu
    strength: 0.78,            // quanto o gradiente domina o fundo (0..1)
    horizonY: 0.42,            // v de tela (0 embaixo, 1 no topo) da linha do horizonte
    // Banda de distância: rampa sobre o TERRENO longe (não o fundo), pra a
    // última crista não bater no céu com uma costura dura. Começa bem depois
    // do meio-campo (medição: 99% do terreno em quadro < 80 unidades).
    atmStart: 48,
    atmEnd: 108,
    atmTerrain: 0.55,          // teto do peso no terreno (fundo sempre usa 1)
    glowColor: '#ffe8c6',      // halo quente/pálido do sol NO ar
    glowSize: 0.26,            // raio do halo (em alturas de tela)
    glowStrength: 0.5,
    // Queda do halo quando o sol sai do quadro: k em `exp(-k * dForaDaTela)`,
    // com a distância medida em alturas de tela a partir da borda.
    glowFalloffK: 1.6,
    // Disco do sol (malha). A máscara de tela que o preserva usa o raio
    // projetado + esta folga (em alturas de tela), pra pegar a borda serrilhada.
    sunColor: '#fff6e8',
    sunRadius: 7.5,            // raio em unidades de mundo
    sunDistance: 220,          // distância do centro do mundo (dentro do far)
    sunMaskPad: 0.012,
  },

  /**
   * Bloom só na ponta clara, discreto. Bright-pass + blur separável em 1/4 de
   * resolução (2 quads pequenos em `cel-shade.tsx`), somado no passe cheio. O
   * limiar alto garante que SÓ o sol/emissivos acendem — os preenchimentos
   * chapados não borram (o cel morre se o bloom esborrata tudo).
   */
  bloom: {
    enabled: true,
    threshold: 0.84,   // luminância (espaço de exibição) acima da qual acende
    strength: 0.18,     // quanto o bloom soma de volta
    radius: 2.0,       // espalhamento do blur (em texels de 1/4 de res)
  },
};

/* ------------------------------------------------------------------ *
 * 1. Rampa toon por material (injeção in-place)
 * ------------------------------------------------------------------ */
const TOON_FLAG = 'celToon_v1';

/** Degrau toon em GLSL, com os limiares/bandas assados das constantes. */
function toonRampGLSL(): string {
  const t = CEL.toon;
  const f = (n: number) => n.toFixed(5);
  return /* glsl */ `
float celRamp( float x ) {
  float e = ${f(t.softness)};
  float a = mix( ${f(t.band0)}, ${f(t.band1)}, smoothstep( ${f(t.thresh0)} - e, ${f(t.thresh0)} + e, x ) );
  return mix( a, ${f(t.band2)}, smoothstep( ${f(t.thresh1)} - e, ${f(t.thresh1)} + e, x ) );
}`;
}

function toonApplyGLSL(): string {
  return /* glsl */ `
{
  vec3 celAlbedo = max( diffuseColor.rgb, vec3( 1e-4 ) );
  vec3 celLit = reflectedLight.directDiffuse / celAlbedo;
  float celF = clamp( max( celLit.r, max( celLit.g, celLit.b ) ), 0.0, 1.0 );
  reflectedLight.directDiffuse = celAlbedo * celRamp( celF );
  reflectedLight.indirectDiffuse *= ${CEL.toon.ambientScale.toFixed(4)};
}
`;
}

/**
 * Injeta a rampa toon num material iluminado, SEM trocar sua identidade
 * (preserva fade/oclusão, vertexColors, flatShading). Idempotente. Compõe com
 * o `onBeforeCompile` existente (ex.: o fade por instância).
 */
export function celShadeMaterial(mat: THREE.Material): void {
  if (!CEL.enabled || !CEL.toon.enabled) return;
  const any = mat as any;
  if (any[TOON_FLAG]) return;
  // Só materiais iluminados têm `reflectedLight`/`<lights_fragment_end>`.
  if (!(any.isMeshStandardMaterial || any.isMeshPhongMaterial || any.isMeshLambertMaterial)) return;

  const prevOBC = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  const toonFn = toonRampGLSL();

  mat.onBeforeCompile = (shader, renderer) => {
    if (prevOBC) (prevOBC as any).call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + toonFn)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + toonApplyGLSL());
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|' + TOON_FLAG;
  mat.needsUpdate = true;
  any[TOON_FLAG] = true;
}

/* ------------------------------------------------------------------ *
 * 2. Passe de filtro de tela cheia (contorno + gradação + névoa + grão)
 * ------------------------------------------------------------------ */
/**
 * Hex → vec3 sRGB (0..1). O filtro roda em espaço de exibição: a cena já vem
 * tonemapeada + codificada em sRGB no render-target, e a saída vai direto pra
 * tela. Por isso NÃO convertemos para linear aqui (seria `new THREE.Color`,
 * que guardaria linear com o ColorManagement ligado).
 */
function linRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export type CelFilterShader = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

export function celFilterShader(): CelFilterShader {
  const g = CEL.grade;
  const o = CEL.outline;
  const h = CEL.haze;
  const v = CEL.vignette;
  const sk = CEL.sky;
  const bl = CEL.bloom;
  return {
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 300 },
      uOrtho: { value: 0 },

      uSkyEnabled: { value: sk.enabled ? 1 : 0 },
      uSkyHorizonColor: { value: new THREE.Vector3(...linRGB(sk.horizonColor)) },
      uSkyHighColor: { value: new THREE.Vector3(...linRGB(sk.highColor)) },
      uSkyStrength: { value: sk.strength },
      uSkyHorizonY: { value: sk.horizonY },
      uSkyGlowColor: { value: new THREE.Vector3(...linRGB(sk.glowColor)) },
      uSkyGlowSize: { value: sk.glowSize },
      uSkyGlowStrength: { value: sk.glowStrength },
      uAtmStart: { value: sk.atmStart },
      uAtmEnd: { value: sk.atmEnd },
      uAtmTerrain: { value: sk.atmTerrain },
      // Posição de tela do disco do sol (0..1) e raio projetado, pro recorte
      // que preserva a malha do Sol. `uSunVisible` = 1 só quando o disco cai
      // dentro do quadro e é dia.
      uSunScreen: { value: new THREE.Vector2(0.5, 0.8) },
      uSunScreenR: { value: 0.03 },
      uSunVisible: { value: 0 },
      // Âncora do halo: a posição do sol CLAMPADA à borda da tela, e o quanto
      // o halo ainda vale (cai conforme o sol se afasta do enquadramento).
      uGlowScreen: { value: new THREE.Vector2(0.5, 1) },
      uGlowFalloff: { value: 0 },
      uDayFactor: { value: 1 },
      uAspect: { value: 1 },

      uBloomEnabled: { value: bl.enabled ? 1 : 0 },
      uBloomTex: { value: null },
      uBloomStrength: { value: bl.strength },

      uOutlineColor: { value: new THREE.Vector3(...linRGB(o.color)) },
      uOutlineThickness: { value: o.thickness },
      uOutlineThreshold: { value: o.threshold },
      uOutlineRampEnd: { value: o.rampEnd },
      uOutlineStrength: { value: o.enabled ? o.strength : 0 },

      uPosterSteps: { value: g.posterSteps },
      uContrast: { value: g.contrast },
      uPivot: { value: g.pivot },
      uSlope: { value: new THREE.Vector3(...g.slope) },
      uOffset: { value: new THREE.Vector3(...g.offset) },
      uSaturation: { value: g.saturation },
      uGain: { value: g.gain },

      uHazeColor: { value: new THREE.Vector3(...linRGB(h.color)) },
      uHazeStart: { value: h.start },
      uHazeDensity: { value: h.density },
      uHazeStrength: { value: h.strength },

      uVigAmount: { value: v.amount },
      uVigRadius: { value: v.radius },
      uVigSoftness: { value: v.softness },
      uGrain: { value: CEL.grain.amount },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 uResolution;
      uniform float uTime, uNear, uFar, uOrtho;

      uniform vec3 uOutlineColor;
      uniform float uOutlineThickness, uOutlineThreshold, uOutlineRampEnd, uOutlineStrength;

      uniform vec3 uSlope, uOffset;
      uniform float uPosterSteps, uContrast, uPivot, uSaturation, uGain;

      uniform vec3 uHazeColor;
      uniform float uHazeStart, uHazeDensity, uHazeStrength;

      uniform float uVigAmount, uVigRadius, uVigSoftness, uGrain;

      uniform float uSkyEnabled, uSkyStrength, uSkyHorizonY, uSkyGlowSize, uSkyGlowStrength;
      uniform float uAtmStart, uAtmEnd, uAtmTerrain;
      uniform float uSunScreenR, uSunVisible, uGlowFalloff, uDayFactor, uAspect;
      uniform vec3 uSkyHorizonColor, uSkyHighColor, uSkyGlowColor;
      uniform vec2 uSunScreen, uGlowScreen;

      uniform float uBloomEnabled, uBloomStrength;
      uniform sampler2D uBloomTex;

      const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

      // O sampler do tDiffuse (textura sRGB) decodifica pra LINEAR na leitura.
      // A gradação é pensada em espaço de EXIBIÇÃO (0..1 sRGB), então convertemos
      // linear→sRGB ao ler e devolvemos já em sRGB (a tela espera sRGB; o
      // ShaderMaterial não re-codifica). Sem isto, o pivô/limiares caíam sobre
      // valores lineares minúsculos e esmagavam tudo em preto.
      vec3 toSRGB( vec3 c ) {
        c = max( c, vec3( 0.0 ) );
        return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
      }

      // Profundidade de olho (linear, unidades de mundo) a partir do buffer.
      float eyeDepth( vec2 uv ) {
        float d = texture2D( tDepth, uv ).x;
        if ( uOrtho > 0.5 ) {
          return uNear + d * ( uFar - uNear );
        }
        return ( uNear * uFar ) / ( uFar - d * ( uFar - uNear ) );
      }

      float hash( vec2 p ) {
        return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      }

      void main() {
        vec3 col = toSRGB( texture2D( tDiffuse, vUv ).rgb ); // -> espaço de exibição
        vec2 texel = uOutlineThickness / uResolution;

        // --- Contraste + posterização POR CANAL (fill chapado de pôster).
        // Expande cada canal em torno do pivô (contraste alto) e quantiza em
        // níveis. Por canal (e não restaurando luminância) MANTÉM as diferenças
        // de brilho entre superfícies — é isso que dá contraste real E cores
        // separadas, em vez de achatar tudo num mesmo cinza.
        col = ( col - uPivot ) * uContrast + uPivot;
        col = col * uSlope + uOffset;
        col *= uGain;
        col = clamp( col, 0.0, 1.3 );
        col = floor( col * uPosterSteps + 0.5 ) / uPosterSteps;

        // --- Saturação (separa as cores, pôster).
        float Y2 = dot( col, LUMA );
        col = mix( vec3( Y2 ), col, uSaturation );

        // --- Névoa de cobre SÓ no fundo distante (leve).
        float dc2 = eyeDepth( vUv );
        float fogT = 1.0 - exp( -max( 0.0, dc2 - uHazeStart ) * uHazeDensity );
        col = mix( col, uHazeColor, clamp( fogT, 0.0, 1.0 ) * uHazeStrength );

        // --- Atmosfera: céu gradeado no FUNDO + banda quente no terreno longe,
        // num peso só. Sem gate de luminância (ver nota em cel-style.ts: era ele
        // que matava o efeito). O disco do sol é poupado por GEOMETRIA.
        if ( uSkyEnabled > 0.5 && uDayFactor > 0.01 ) {
          float rawDepth = texture2D( tDepth, vUv ).x;
          float bg = step( 0.9999, rawDepth );                 // 1 = céu
          // Rampa só na cauda longe do terreno; morre bem antes do meio-campo.
          float far = smoothstep( uAtmStart, uAtmEnd, dc2 ) * uAtmTerrain;
          float atm = max( bg, far * ( 1.0 - bg ) );

          // Recorte do disco: pixel de fundo perto da posição projetada do sol
          // fica intacto. Se o relevo cobre o sol, aquele pixel tem profundidade
          // de terreno (bg = 0) e a máscara nem liga — a oclusão continua certa.
          vec2 sd = vUv - uSunScreen; sd.x *= uAspect;
          float sunMask = bg * uSunVisible *
            ( 1.0 - smoothstep( uSunScreenR, uSunScreenR * 1.6, length( sd ) ) );

          float w = clamp( atm, 0.0, 1.0 ) * ( 1.0 - sunMask ) * uSkyStrength * uDayFactor;
          float up = smoothstep( uSkyHorizonY - 0.08, 1.0, vUv.y );
          vec3 grad = mix( uSkyHorizonColor, uSkyHighColor, up );
          col = mix( col, grad, w );

          // Halo quente ancorado na direção do sol, CLAMPADA à borda da tela
          // (uGlowScreen) e com queda por distância fora do quadro
          // (uGlowFalloff). Só pinta onde já há atmosfera, pra não lavar o chão.
          vec2 gd = vUv - uGlowScreen; gd.x *= uAspect;
          float glow = exp( -dot( gd, gd ) / ( uSkyGlowSize * uSkyGlowSize ) );
          col = mix( col, uSkyGlowColor,
            clamp( glow, 0.0, 1.0 ) * uSkyGlowStrength * uDayFactor * uGlowFalloff
            * clamp( atm, 0.0, 1.0 ) * ( 1.0 - sunMask ) );
        }

        // --- Contorno: profundidade, amostra em 8 vizinhos num raio grosso
        // (visível a olho nu em tamanho real). Aplicado DEPOIS da gradação pra
        // a tinta sair preta de verdade.
        if ( uOutlineStrength > 0.0 ) {
          float dc = eyeDepth( vUv );
          float diff = 0.0;
          diff += abs( eyeDepth( vUv + vec2(  texel.x, 0.0 ) ) - dc );
          diff += abs( eyeDepth( vUv + vec2( -texel.x, 0.0 ) ) - dc );
          diff += abs( eyeDepth( vUv + vec2( 0.0,  texel.y ) ) - dc );
          diff += abs( eyeDepth( vUv + vec2( 0.0, -texel.y ) ) - dc );
          diff += abs( eyeDepth( vUv + texel ) - dc );
          diff += abs( eyeDepth( vUv - texel ) - dc );
          diff += abs( eyeDepth( vUv + vec2(  texel.x, -texel.y ) ) - dc );
          diff += abs( eyeDepth( vUv + vec2( -texel.x,  texel.y ) ) - dc );
          float rel = diff / max( dc, 0.5 );
          float edge = smoothstep( uOutlineThreshold, uOutlineRampEnd, rel ) * uOutlineStrength;
          col = mix( col, uOutlineColor, clamp( edge, 0.0, 1.0 ) );
        }

        // --- Bloom (aditivo, só a ponta clara): soma o blur bright-passado.
        if ( uBloomEnabled > 0.5 ) {
          col += texture2D( uBloomTex, vUv ).rgb * uBloomStrength;
        }

        // --- Grão de filme.
        float gnoise = hash( vUv * uResolution + uTime );
        col += ( gnoise - 0.5 ) * uGrain;

        // --- Vinheta (discreta).
        float d = length( vUv - 0.5 );
        float vig = smoothstep( uVigRadius, uVigRadius - uVigSoftness, d );
        col *= mix( 1.0, vig, uVigAmount );

        gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
      }
    `,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Bloom: bright-pass + blur gaussiano separável (1/4 de resolução).
 *
 * Um único material reusado em dois quads (H e V). `uBright > 0.5` liga o
 * bright-pass (só no 1º passe, lendo a cena); o 2º passe só desfoca. 9 taps por
 * eixo. A cena chega como textura sRGB (sampler decodifica p/ LINEAR), então
 * convertemos p/ exibição (toSRGB) antes de medir luminância — mesmo espaço do
 * filtro cheio. O alvo do bloom é LINEAR (sem recodificar), lido cru no filtro.
 * ------------------------------------------------------------------ */
export function bloomBlurShader(): CelFilterShader {
  return {
    uniforms: {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uDir: { value: new THREE.Vector2(1, 0) },
      uThreshold: { value: CEL.bloom.threshold },
      uBright: { value: 1 },
      uRadius: { value: CEL.bloom.radius },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tInput;
      uniform vec2 uTexel, uDir;
      uniform float uThreshold, uBright, uRadius;
      const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

      vec3 toSRGB( vec3 c ) {
        c = max( c, vec3( 0.0 ) );
        return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
      }

      // Lê a entrada já em espaço de exibição; se bright-pass, pesa pelo excesso
      // acima do limiar (preserva a cor, acende só o que é claro de verdade).
      vec3 tap( vec2 uv ) {
        vec3 c = texture2D( tInput, uv ).rgb;
        if ( uBright > 0.5 ) {
          c = toSRGB( c );
          float l = dot( c, LUMA );
          c *= max( 0.0, l - uThreshold ) / max( 1.0 - uThreshold, 1e-3 );
        }
        return c;
      }

      void main() {
        vec2 step1 = uDir * uTexel * uRadius;
        // Pesos gaussianos (sigma ~2), 9 taps.
        vec3 sum = tap( vUv ) * 0.2270;
        sum += tap( vUv + step1 * 1.0 ) * 0.1945;
        sum += tap( vUv - step1 * 1.0 ) * 0.1945;
        sum += tap( vUv + step1 * 2.0 ) * 0.1216;
        sum += tap( vUv - step1 * 2.0 ) * 0.1216;
        sum += tap( vUv + step1 * 3.0 ) * 0.0540;
        sum += tap( vUv - step1 * 3.0 ) * 0.0540;
        sum += tap( vUv + step1 * 4.0 ) * 0.0162;
        sum += tap( vUv - step1 * 4.0 ) * 0.0162;
        gl_FragColor = vec4( sum, 1.0 );
      }
    `,
  };
}
