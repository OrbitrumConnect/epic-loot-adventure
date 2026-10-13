import * as THREE from 'three';

type Surface = 'forrest_ground_01' | 'bark_brown_02' | 'worn_rock_natural_01';
const textures = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** Local CC0 textures; only albedo is sRGB. Normal and roughness remain linear. */
export function pbrMaps(surface: Surface, repeatX = 1, repeatY = repeatX) {
  const texture = (channel: 'diff' | 'nor_gl' | 'rough') => {
    const key = `${surface}:${channel}:${repeatX}:${repeatY}`;
    let result = textures.get(key);
    if (!result) {
      result = loader.load(`/assets/pbr/${surface}/${surface}_${channel}_1k.jpg`);
      result.colorSpace = channel === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      result.wrapS = result.wrapT = THREE.RepeatWrapping;
      result.repeat.set(repeatX, repeatY);
      result.anisotropy = 8;
      textures.set(key, result);
    }
    return result;
  };
  return { map: texture('diff'), normalMap: texture('nor_gl'), roughnessMap: texture('rough') };
}
