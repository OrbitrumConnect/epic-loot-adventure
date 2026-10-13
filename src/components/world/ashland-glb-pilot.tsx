import { Suspense, useEffect, useRef } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import treeUrl from "../../../art/packs/01-ashland-lowpoly/models/ashroot-tree.glb?url";
import weaponUrl from "../../../art/packs/01-ashland-lowpoly/models/ash-cleaver.glb?url";
import heroUrl from "../../../art/packs/01-ashland-lowpoly/models/ashland-survivor.glb?url";
import enemyUrl from "../../../art/packs/01-ashland-lowpoly/models/ashland-stalker.glb?url";
import { terrainHeight } from "./world-kit";

function Model({
  source,
  clip,
  position,
}: {
  source: string;
  clip?: string;
  position: [number, number, number];
}) {
  const root = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(source);
  const { actions } = useAnimations(animations, root);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [scene]);

  useEffect(() => {
    const action = clip ? actions[clip] : undefined;
    action?.reset().fadeIn(0.2).play();
    return () => {
      action?.fadeOut(0.15);
    };
  }, [actions, clip]);

  return (
    <group ref={root} position={position}>
      <primitive object={scene} />
    </group>
  );
}

function SceneModels() {
  const coords: [number, number][] = [
    [-3.4, -3.2],
    [-1.1, -3.2],
    [1.1, -3.2],
    [3.6, -3.2],
  ];
  const positions = coords.map(([x, z]) => [x, terrainHeight(x, z), z] as [number, number, number]);
  return (
    <group>
      <Model source={treeUrl} clip="Ashroot | wind sway" position={positions[0]!} />
      <Model source={weaponUrl} position={[positions[1]![0], positions[1]![1], positions[1]![2]]} />
      <Model source={heroUrl} clip="Ashland Survivor | Idle" position={positions[2]!} />
      <Model source={enemyUrl} clip="Ashland Stalker | Idle" position={positions[3]!} />
    </group>
  );
}

export function AshlandPilot() {
  return (
    <Suspense fallback={null}>
      <SceneModels />
    </Suspense>
  );
}

useGLTF.preload(treeUrl);
useGLTF.preload(weaponUrl);
useGLTF.preload(heroUrl);
useGLTF.preload(enemyUrl);
