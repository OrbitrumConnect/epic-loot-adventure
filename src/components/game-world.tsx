import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type WorldProps = {
  mode: string;
  attack: number;
  onCollect: () => void;
  onPosition: (x: number, z: number) => void;
  paused: boolean;
};

const names = [
  'ground', 'ground-light', 'grass', 'pine', 'leaf', 'leaf-light', 'trunk',
  'path', 'rock', 'rock-light', 'water', 'water-light', 'armor', 'cloak',
  'metal', 'crystal', 'gold', 'dark', 'light',
] as const;

type Palette = Record<(typeof names)[number], string>;

function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  return Object.fromEntries(
    names.map(name => {
      if (!ctx) return [name, css.getPropertyValue(`--world-${name}`).trim()];
      ctx.fillStyle = css.getPropertyValue(`--world-${name}`).trim();
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [name, `rgb(${r},${g},${b})`];
    }),
  ) as Palette;
}

function rand(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * 0.15 +
    Math.cos(z * 0.07) * 0.12 +
    Math.sin((x + z) * 0.04) * 0.2
  );
}

function Tree({ x, z, size = 1, seed, c }: { x: number; z: number; size?: number; seed: number; c: Palette }) {
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]} scale={size}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.2, 2.6, 6]} />
        <meshStandardMaterial color={c.trunk} />
      </mesh>
      {seed % 3 === 0 ? (
        <>
          {[1.8, 2.6, 3.3].map((ty, i) => (
            <mesh key={ty} position={[0, ty, 0]} castShadow>
              <coneGeometry args={[1.3 - i * 0.28, 1.8, 7]} />
              <meshStandardMaterial color={i === 1 ? c.leaf : c.pine} flatShading />
            </mesh>
          ))}
        </>
      ) : seed % 3 === 1 ? (
        <>
          <mesh position={[0, 3, 0]} scale={[1.3, 1, 1.2]} castShadow>
            <icosahedronGeometry args={[1.45, 1]} />
            <meshStandardMaterial color={seed % 2 ? c.leaf : c['leaf-light']} flatShading />
          </mesh>
          <mesh position={[0.7, 2.6, 0.35]} castShadow>
            <icosahedronGeometry args={[0.95, 1]} />
            <meshStandardMaterial color={c.leaf} flatShading />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 2.8, 0]} castShadow>
            <sphereGeometry args={[1.2, 6, 5]} />
            <meshStandardMaterial color={c['leaf-light']} flatShading />
          </mesh>
          <mesh position={[-0.5, 2.4, 0.3]} castShadow>
            <sphereGeometry args={[0.7, 5, 4]} />
            <meshStandardMaterial color={c.leaf} flatShading />
          </mesh>
          <mesh position={[0.4, 2.2, -0.3]} castShadow>
            <sphereGeometry args={[0.6, 5, 4]} />
            <meshStandardMaterial color={c.pine} flatShading />
          </mesh>
        </>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[1.2, 8]} />
        <meshStandardMaterial color={c['ground-light']} />
      </mesh>
    </group>
  );
}

function Rock({ x, z, size = 1, c }: { x: number; z: number; size?: number; c: Palette }) {
  const y = terrainHeight(x, z);
  return (
    <mesh
      position={[x, y + 0.35 * size, z]}
      scale={[size, 0.7 * size, 0.85 * size]}
      rotation={[0.15, x * 0.5, 0.1]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial color={c.rock} flatShading />
    </mesh>
  );
}

function Ruins({ c }: { c: Palette }) {
  const y = terrainHeight(7, -8);
  return (
    <group position={[7, y, -8]} rotation={[0, -0.2, 0]}>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[7, 0.3, 5]} />
        <meshStandardMaterial color={c['rock-light']} />
      </mesh>
      {[-3, 3].map(x => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[1, 2.4, 5]} />
            <meshStandardMaterial color={c.rock} />
          </mesh>
          {[-1.8, 0, 1.8].map(zz => (
            <mesh key={zz} position={[0, 2.6, zz]} castShadow>
              <boxGeometry args={[1.12, 0.55, 0.7]} />
              <meshStandardMaterial color={c['rock-light']} />
            </mesh>
          ))}
          <mesh position={[0, 3, -2]} castShadow>
            <cylinderGeometry args={[0.9, 1, 5, 6]} />
            <meshStandardMaterial color={c.rock} flatShading />
          </mesh>
          <mesh position={[0, 5.65, -2]} castShadow>
            <coneGeometry args={[1.1, 1.6, 6]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.4, -2.1]} castShadow>
        <boxGeometry args={[6, 2.8, 0.8]} />
        <meshStandardMaterial color={c.rock} />
      </mesh>
      <mesh position={[0, 1.7, -1.65]}>
        <boxGeometry args={[1.7, 2.4, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh position={[3.6, 2.9, -1.3]}>
        <boxGeometry args={[0.07, 1.6, 1]} />
        <meshStandardMaterial color={c.cloak} side={THREE.DoubleSide} />
      </mesh>
      <Rock x={-3.5} z={3} size={0.9} c={c} />
      <Rock x={2} z={3.5} size={0.6} c={c} />
    </group>
  );
}

function Campfire({ c, position: pos }: { c: Palette; position: [number, number, number] }) {
  const ref = useRef<THREE.PointLight>(null);
  const y = terrainHeight(pos[0], pos[2]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 3 + Math.sin(clock.elapsedTime * 8) * 0.8;
  });
  return (
    <group position={[pos[0], y, pos[2]]}>
      {[0, 1.2, 2.4, 3.6, 5].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3]} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.35]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
      ))}
      <pointLight ref={ref} position={[0, 0.6, 0]} color="#ff8844" intensity={3} distance={8} />
      <mesh position={[0, 0.3, 0]}>
        <coneGeometry args={[0.15, 0.5, 4]} />
        <meshStandardMaterial color="#ff6622" emissive="#ff4400" emissiveIntensity={2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function Character({
  c, attack, movement, onPosition, paused,
}: {
  c: Palette;
  attack: number;
  movement: React.RefObject<THREE.Vector3>;
  onPosition: WorldProps['onPosition'];
  paused: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const sword = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const pulse = useRef(0);
  const tick = useRef(0);
  const velocity = useRef(new THREE.Vector2(0, 0));

  useEffect(() => { pulse.current = 0.35; }, [attack]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame((state, delta) => {
    if (!body.current || paused) return;
    const dt = Math.min(delta, 0.05);
    const k = keys.current;

    const dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const dz = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'));

    let targetVx = (dx + dz) * 0.707;
    let targetVz = (dz - dx) * 0.707;

    if (dx || dz) {
      movement.current.copy(body.current.position);
    } else {
      const diff = movement.current.clone().sub(body.current.position);
      if (diff.length() > 0.15) {
        diff.normalize();
        targetVx = diff.x;
        targetVz = diff.z;
      } else {
        targetVx = 0;
        targetVz = 0;
      }
    }

    const accel = 12;
    const decel = 8;
    const speed = 4.5;

    if (targetVx !== 0 || targetVz !== 0) {
      velocity.current.x += (targetVx * speed - velocity.current.x) * accel * dt;
      velocity.current.y += (targetVz * speed - velocity.current.y) * accel * dt;
    } else {
      velocity.current.x *= 1 - decel * dt;
      velocity.current.y *= 1 - decel * dt;
      if (Math.abs(velocity.current.x) < 0.01) velocity.current.x = 0;
      if (Math.abs(velocity.current.y) < 0.01) velocity.current.y = 0;
    }

    const moving = velocity.current.length() > 0.05;

    if (moving) {
      body.current.position.x = THREE.MathUtils.clamp(
        body.current.position.x + velocity.current.x * dt, -18, 18,
      );
      body.current.position.z = THREE.MathUtils.clamp(
        body.current.position.z + velocity.current.y * dt, -18, 18,
      );
      body.current.rotation.y = Math.atan2(velocity.current.x, velocity.current.y);

      const ty = terrainHeight(body.current.position.x, body.current.position.z);
      body.current.position.y = ty + Math.sin(state.clock.elapsedTime * 13) * 0.05;
    } else {
      const ty = terrainHeight(body.current.position.x, body.current.position.z);
      body.current.position.y = ty + Math.sin(state.clock.elapsedTime * 2) * 0.015;
    }

    if (sword.current) {
      pulse.current = Math.max(0, pulse.current - dt);
      sword.current.rotation.x = pulse.current > 0 ? Math.sin(pulse.current * 17) * 1.8 : 0;
    }

    tick.current += dt;
    if (tick.current > 0.35) {
      onPosition(body.current.position.x, body.current.position.z);
      tick.current = 0;
    }
  });

  return (
    <group ref={body} position={[0, 0, 1]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.53, 0.57, 32]} />
        <meshBasicMaterial color={c.gold} transparent opacity={0.7} />
      </mesh>
      {[-0.17, 0.17].map(x => (
        <mesh key={x} position={[x, 0.3, 0]} castShadow>
          <boxGeometry args={[0.24, 0.6, 0.26]} />
          <meshStandardMaterial color={c.dark} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.62, 0.67, 0.36]} />
        <meshStandardMaterial color={c.armor} />
      </mesh>
      <mesh position={[0, 1.48, 0]} castShadow>
        <boxGeometry args={[0.42, 0.43, 0.4]} />
        <meshStandardMaterial color={c.metal} />
      </mesh>
      <mesh position={[0, 1.47, 0.205]}>
        <boxGeometry args={[0.29, 0.1, 0.03]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh position={[0, 0.91, -0.25]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.93, 0.09]} />
        <meshStandardMaterial color={c.cloak} />
      </mesh>
      <mesh position={[-0.48, 0.92, 0.08]} rotation={[0, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.1, 6]} />
        <meshStandardMaterial color={c.trunk} />
      </mesh>
      <group ref={sword} position={[0.45, 1, 0.15]}>
        <mesh position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 1.1, 0.07]} />
          <meshStandardMaterial color={c.metal} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <boxGeometry args={[0.34, 0.07, 0.07]} />
          <meshStandardMaterial color={c.gold} />
        </mesh>
      </group>
    </group>
  );
}

function Wolf({ c, position: pos }: { c: Palette; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const y = terrainHeight(pos[0], pos[2]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.x = pos[0] + Math.sin(clock.elapsedTime * 0.5) * 0.8;
      ref.current.position.z = pos[2] + Math.cos(clock.elapsedTime * 0.3) * 0.5;
      ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.5;
      const wy = terrainHeight(ref.current.position.x, ref.current.position.z);
      ref.current.position.y = wy;
    }
  });

  return (
    <group ref={ref} position={[pos[0], y, pos[2]]} rotation={[0, 0.8, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.45, 0.9]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh position={[0, 0.78, 0.48]} castShadow>
        <boxGeometry args={[0.35, 0.36, 0.45]} />
        <meshStandardMaterial color={c.rock} />
      </mesh>
      {[-0.14, 0.14].map(x => (
        <group key={x}>
          <mesh position={[x, 0.22, 0.3]}>
            <boxGeometry args={[0.1, 0.45, 0.12]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[x, 0.22, -0.3]}>
            <boxGeometry args={[0.1, 0.45, 0.12]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[x, 1, 0.4]}>
            <coneGeometry args={[0.1, 0.25, 3]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.6, -0.6]} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.6]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh position={[0, 0.9, 0.7]}>
        <sphereGeometry args={[0.06, 4, 3]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}

function GrassPatches({ c, count }: { c: Palette; count: number }) {
  const geo = useMemo(() => new THREE.ConeGeometry(0.09, 0.35, 3), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: c.grass }), [c.grass]);
  const positions = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (rand(i + 1400) - 0.5) * 56,
        z: (rand(i + 1900) - 0.5) * 52,
        rot: rand(i) * 6,
      })),
    [count],
  );
  return (
    <>
      {positions.map((p, i) => {
        const y = terrainHeight(p.x, p.z);
        return (
          <mesh key={i} geometry={geo} material={mat} position={[p.x, y + 0.1, p.z]} rotation={[0, p.rot, 0]} />
        );
      })}
    </>
  );
}

function TerrainMesh({ c }: { c: Palette }) {
  const geo = useMemo(() => {
    const size = 180;
    const segments = 64;
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, terrainHeight(x, y));
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={geo}>
      <meshStandardMaterial color={c.ground} />
    </mesh>
  );
}

function WorldScene(props: WorldProps & { c: Palette }) {
  const { c } = props;
  const target = useRef(new THREE.Vector3(0, 0, 1));
  const { camera, size } = useThree();

  useEffect(() => {
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.OrthographicCamera)
      camera.zoom = Math.max(12, Math.min(33, size.width / 32));
    camera.updateProjectionMatrix();
  }, [camera, size.width]);

  const trees = useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        x: (rand(i + 1) - 0.5) * 62,
        z: (rand(i + 301) - 0.5) * 56,
        size: 0.65 + rand(i + 701) * 0.7,
        seed: i,
      }))
        .filter(p => Math.abs(p.x) > 4.5 || Math.abs(p.z) > 10)
        .filter(p => !(p.x > 2 && p.x < 12 && p.z < -3 && p.z > -13)),
    [],
  );

  const path = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-22, 0.025, 15),
      new THREE.Vector3(-12, 0.025, 9),
      new THREE.Vector3(-7, 0.025, 6),
      new THREE.Vector3(0, 0.025, 1),
      new THREE.Vector3(4, 0.025, -3),
      new THREE.Vector3(7, 0.025, -8),
      new THREE.Vector3(12, 0.025, -12),
      new THREE.Vector3(20, 0.025, -17),
    ]);
    const pts = curve.getPoints(90);
    const v: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const d = b.clone().sub(a).normalize();
      const p = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.95);
      const q = [
        a.clone().add(p), a.clone().sub(p), b.clone().add(p),
        b.clone().add(p), a.clone().sub(p), b.clone().sub(p),
      ];
      q.forEach(n => {
        const ty = terrainHeight(n.x, n.z) + 0.03;
        v.push(n.x, ty, n.z);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  const rocks = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        x: (rand(i + 911) - 0.5) * 54,
        z: (rand(i + 1200) - 0.5) * 50,
        size: 0.25 + rand(i + 90) * 0.9,
      })),
    [],
  );

  return (
    <>
      <color attach="background" args={[c.ground]} />
      <fog attach="fog" args={[c.ground, 42, 90]} />
      <ambientLight intensity={1.5} color={c.light} />
      <directionalLight
        position={[-12, 25, 8]}
        intensity={2.8}
        color={c.light}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.001}
      />

      <TerrainMesh c={c} />

      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onPointerDown={e => {
          e.stopPropagation();
          if (!props.paused) target.current.set(e.point.x, 0, e.point.z);
        }}
      >
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color={c.ground} transparent opacity={0} />
      </mesh>

      <mesh geometry={path} receiveShadow>
        <meshStandardMaterial color={c.path} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[-10, 0.05, -2]} rotation={[-Math.PI / 2, 0, 0.35]}>
        <planeGeometry args={[5, 80]} />
        <meshStandardMaterial color={c.water} roughness={0.3} transparent opacity={0.85} />
      </mesh>
      {Array.from({ length: 22 }, (_, i) => (
        <mesh
          key={`water${i}`}
          position={[-10 + (rand(i + 50) - 0.5) * 3, 0.07, (rand(i + 80) - 0.5) * 50]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.4 + rand(i) * 1.2, 0.05]} />
          <meshBasicMaterial color={c['water-light']} transparent opacity={0.35} />
        </mesh>
      ))}

      <group position={[-9, terrainHeight(-9, 7) + 0.19, 7]} rotation={[0, -0.35, 0]}>
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[(i - 8) * 0.35, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.32, 0.18, 2.1]} />
            <meshStandardMaterial color={i % 2 ? c.trunk : c.path} />
          </mesh>
        ))}
      </group>

      {trees.map((p, i) => (
        <Tree key={i} {...p} c={c} />
      ))}
      {rocks.map((p, i) => (
        <Rock key={i} {...p} c={c} />
      ))}
      <GrassPatches c={c} count={280} />

      <Ruins c={c} />
      <Campfire c={c} position={[-1, 0, 4]} />
      <Campfire c={c} position={[10, 0, -6]} />

      <group
        position={[-3, terrainHeight(-3, -2), -2]}
        onClick={e => { e.stopPropagation(); props.onCollect(); }}
      >
        <Rock x={0} z={0} size={1.25} c={c} />
        {[-0.4, 0, 0.4].map((x, i) => (
          <mesh key={x} position={[x, 0.9 + i * 0.1, 0.1]} rotation={[0, 0, x]} castShadow>
            <coneGeometry args={[0.18, 0.9, 5]} />
            <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>

      <group
        position={[2, terrainHeight(2, 3) + 0.2, 3]}
        onClick={e => { e.stopPropagation(); props.onCollect(); }}
      >
        <mesh castShadow>
          <boxGeometry args={[0.65, 0.4, 0.42]} />
          <meshStandardMaterial color={c.trunk} />
        </mesh>
        <mesh position={[0, 0.13, 0.22]}>
          <boxGeometry args={[0.09, 0.18, 0.025]} />
          <meshStandardMaterial color={c.gold} />
        </mesh>
      </group>

      <Wolf c={c} position={[-3, 0, 5]} />
      <Wolf c={c} position={[5, 0, 1]} />

      <group position={[4, terrainHeight(4, 5), 5]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.3, 0.5, 2, 6]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.4} />
        </mesh>
      </group>

      <Character c={c} attack={props.attack} movement={target} onPosition={props.onPosition} paused={props.paused} />
    </>
  );
}

export default function GameWorld(props: WorldProps) {
  const c = useMemo(palette, []);
  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
      <OrthographicCamera makeDefault position={[24, 29, 24]} zoom={33} near={0.1} far={140} />
      <WorldScene {...props} c={c} />
    </Canvas>
  );
}
