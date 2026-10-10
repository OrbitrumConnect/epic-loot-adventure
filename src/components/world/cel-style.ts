/**
 * Direção de arte "cel-shaded" (fase 1 — filtro + materiais).
 *
 * Alvo visual: `art/concept/sheets/style-c-celshaded.png` — contornos escuros,
 * terminador de sombra em degraus duros, preenchimentos chapados, contraste de
 * pôster, paleta requeimada (`art/style/palette-c.json`).
 *
 * Este módulo é a ÚNICA fonte de ajuste do look. Tudo é aditivo e reversível:
 *  - `CEL.enabled = false` desliga o filtro inteiro (volta ao render padrão).
 *  - `CEL.toon.enabled = false` tira só o degrau de iluminação dos materiais.
 *
 * Duas peças:
 *  1. `celShadeMaterial(mat)` — injeta, EM LUGAR (sem trocar a identidade do
 *     material, então o sistema de fade/oclusão e o `vertexColors`/`flatShading`
 *     continuam valendo), uma rampa toon de 3 degraus na luz direta de qualquer
 *     material iluminado (Standard/Phong/Lambert). Compõe com o
 *     `onBeforeCompile` que o fade já usa, em vez de sobrescrever.
 *  2. `celFilterShader()` — passe de tela cheia (contorno por profundidade +
 *     gradação de cor + névoa de cobre no horizonte + grão + vinheta), montado
 *     em `cel-shade.tsx` via EffectComposer.
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
    enabled: true,
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
    enabled: true,
    color: '#100c0a',      // near-black da paleta
    thickness: 2.2,        // raio da amostra, em pixels (grosso = visível a olho nu)
    threshold: 0.08,       // início da borda (diff de prof. relativa)
    rampEnd: 0.32,         // fim da borda (acima disso = contorno cheio)
    strength: 1.15,
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
    posterSteps: 11,    // níveis POR CANAL (fino: limpa sem achatar)
    contrast: 1.4,      // expande cada canal em torno do pivô (contraste de pôster)
    pivot: 0.46,        // ponto fixo da expansão de contraste (≈ média da cena)
    saturation: 0.8,    // puxa a saturação pra perto da referência (~0.40)
    slope: [1.05, 1.01, 0.95] as [number, number, number],  // calor leve
    offset: [0.02, 0.012, 0.005] as [number, number, number],
    gain: 1.32,         // ganho geral (acerta o brilho médio)
  },

  /** Névoa de cobre: tinge SÓ o fundo distante (horizonte), leve. */
  haze: {
    color: '#edb067',
    start: 60,     // distância (unidades de olho) onde começa
    density: 0.008,
    strength: 0.3,
  },

  /** Vinheta e grão de filme (ambos discretos — não escurecer a cena). */
  vignette: { amount: 0.14, radius: 1.15, softness: 0.7 },
  grain: { amount: 0.028 },
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
  return {
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 300 },
      uOrtho: { value: 0 },

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
