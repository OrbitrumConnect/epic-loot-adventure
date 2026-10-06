import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type WorldProps = { mode: string; attack: number; onCollect: () => void; onPosition: (x: number, z: number) => void; paused: boolean };
const names = ['ground','ground-light','grass','pine','leaf','leaf-light','trunk','path','rock','rock-light','water','water-light','armor','cloak','metal','crystal','gold','dark','light'] as const;
type Palette = Record<typeof names[number], string>;
function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  return Object.fromEntries(names.map(name => {
    if (!ctx) return [name, css.getPropertyValue(`--world-${name}`).trim()];
    ctx.fillStyle = css.getPropertyValue(`--world-${name}`).trim(); ctx.fillRect(0,0,1,1);
    const [r,g,b] = ctx.getImageData(0,0,1,1).data;
    return [name, `rgb(${r},${g},${b})`];
  })) as Palette;
}
function rand(seed: number) { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n-Math.floor(n); }
function Tree({ x,z,size=1,seed,c }: {x:number;z:number;size?:number;seed:number;c:Palette}) {
  return <group position={[x,0,z]} scale={size}>
    <mesh position={[0,1.3,0]} castShadow><cylinderGeometry args={[.14,.23,2.6,5]}/><meshStandardMaterial color={c.trunk}/></mesh>
    {seed%3===0 ? <>{[1.8,2.6,3.3].map((y,i)=><mesh key={y} position={[0,y,0]} castShadow><coneGeometry args={[1.3-i*.28,1.8,6]}/><meshStandardMaterial color={i===1?c.leaf:c.pine} flatShading/></mesh>)}</> : <>
      <mesh position={[0,3,0]} scale={[1.3,1,1.2]} castShadow><icosahedronGeometry args={[1.45,0]}/><meshStandardMaterial color={seed%2?c.leaf:c['leaf-light']} flatShading/></mesh>
      <mesh position={[.7,2.6,.35]} castShadow><icosahedronGeometry args={[.95,0]}/><meshStandardMaterial color={c.leaf} flatShading/></mesh>
    </>}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.012,0]}><circleGeometry args={[1.2,7]}/><meshStandardMaterial color={c['ground-light']}/></mesh>
  </group>;
}
function Rock({x,z,size=1,c}:{x:number;z:number;size?:number;c:Palette}) {return <mesh position={[x,.4*size,z]} scale={[size,.75*size,.85*size]} rotation={[.2,x,.2]} castShadow receiveShadow><dodecahedronGeometry args={[.8,0]}/><meshStandardMaterial color={c.rock} flatShading/></mesh>;}
function Ruins({c}:{c:Palette}) {
  return <group position={[7,0,-8]} rotation={[0,-.2,0]}>
    <mesh position={[0,.1,0]} receiveShadow><boxGeometry args={[7,.3,5]}/><meshStandardMaterial color={c['rock-light']}/></mesh>
    {[-3,3].map(x=><group key={x} position={[x,0,0]}>
      <mesh position={[0,1.2,0]} castShadow><boxGeometry args={[1,2.4,5]}/><meshStandardMaterial color={c.rock}/></mesh>
      {[-1.8,0,1.8].map(z=><mesh key={z} position={[0,2.6,z]} castShadow><boxGeometry args={[1.12,.55,.7]}/><meshStandardMaterial color={c['rock-light']}/></mesh>)}
      <mesh position={[0,3,-2]} castShadow><cylinderGeometry args={[.9,1,5,6]}/><meshStandardMaterial color={c.rock} flatShading/></mesh>
      <mesh position={[0,5.65,-2]} castShadow><coneGeometry args={[1.1,1.6,6]}/><meshStandardMaterial color={c.dark}/></mesh>
    </group>)}
    <mesh position={[0,1.4,-2.1]} castShadow><boxGeometry args={[6,2.8,.8]}/><meshStandardMaterial color={c.rock}/></mesh>
    <mesh position={[0,1.7,-1.65]}><boxGeometry args={[1.7,2.4,.12]}/><meshStandardMaterial color={c.dark}/></mesh>
    <mesh position={[3.6,2.9,-1.3]}><boxGeometry args={[.07,1.6,1]}/><meshStandardMaterial color={c.cloak} side={THREE.DoubleSide}/></mesh>
    <Rock x={-3.5} z={3} size={.9} c={c}/><Rock x={2} z={3.5} size={.6} c={c}/>
  </group>;
}
function Character({c,attack,movement,onPosition,paused}:{c:Palette;attack:number;movement:React.RefObject<THREE.Vector3>;onPosition:WorldProps['onPosition'];paused:boolean}) {
  const body = useRef<THREE.Group>(null); const sword = useRef<THREE.Group>(null); const keys = useRef(new Set<string>()); const pulse = useRef(0); const tick = useRef(0);
  useEffect(()=>{pulse.current=.35;},[attack]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.current.add(e.code);}};
    const up=(e:KeyboardEvent)=>keys.current.delete(e.code); const clear=()=>keys.current.clear();
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);
    return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);};
  },[]);
  useFrame((state,delta)=>{
    if (!body.current || paused) return;
    const dt=Math.min(delta,.05), k=keys.current;
    const dx=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));
    const dz=Number(k.has('KeyS')||k.has('ArrowDown'))-Number(k.has('KeyW')||k.has('ArrowUp'));
    let vx=(dx+dz)*.707, vz=(dz-dx)*.707;
    if(dx||dz) movement.current.copy(body.current.position);
    else { const diff=movement.current.clone().sub(body.current.position); if(diff.length()>.15){diff.normalize();vx=diff.x;vz=diff.z;} }
    if(vx||vz){body.current.position.x=THREE.MathUtils.clamp(body.current.position.x+vx*dt*4,-14,14);body.current.position.z=THREE.MathUtils.clamp(body.current.position.z+vz*dt*4,-14,14);body.current.rotation.y=Math.atan2(vx,vz);body.current.position.y=Math.sin(state.clock.elapsedTime*13)*.045;}
    else body.current.position.y=Math.sin(state.clock.elapsedTime*2)*.015;
    if(sword.current){pulse.current=Math.max(0,pulse.current-dt);sword.current.rotation.x=pulse.current>0?Math.sin(pulse.current*17)*1.8:0;}
    tick.current+=dt;if(tick.current>.35){onPosition(body.current.position.x,body.current.position.z);tick.current=0;}
  });
  return <group ref={body} position={[0,0,1]}>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[.53,.57,32]}/><meshBasicMaterial color={c.gold} transparent opacity={.7}/></mesh>
    {[-.17,.17].map(x=><mesh key={x} position={[x,.3,0]} castShadow><boxGeometry args={[.24,.6,.26]}/><meshStandardMaterial color={c.dark}/></mesh>)}
    <mesh position={[0,.9,0]} castShadow><boxGeometry args={[.62,.67,.36]}/><meshStandardMaterial color={c.armor}/></mesh>
    <mesh position={[0,1.48,0]} castShadow><boxGeometry args={[.42,.43,.4]}/><meshStandardMaterial color={c.metal}/></mesh>
    <mesh position={[0,1.47,.205]}><boxGeometry args={[.29,.10,.03]}/><meshStandardMaterial color={c.dark}/></mesh>
    <mesh position={[0,.91,-.25]} rotation={[.15,0,0]} castShadow><boxGeometry args={[.7,.93,.09]}/><meshStandardMaterial color={c.cloak}/></mesh>
    <mesh position={[-.48,.92,.08]} rotation={[0,0,-.15]} castShadow><cylinderGeometry args={[.34,.34,.1,6]}/><meshStandardMaterial color={c.trunk}/></mesh>
    <group ref={sword} position={[.45,1,.15]}><mesh position={[0,0,.55]} rotation={[Math.PI/2,0,0]} castShadow><boxGeometry args={[.08,1.1,.07]}/><meshStandardMaterial color={c.metal}/></mesh><mesh position={[0,0,.08]}><boxGeometry args={[.34,.07,.07]}/><meshStandardMaterial color={c.gold}/></mesh></group>
  </group>;
}
function Wolf({c,position}:{c:Palette;position:[number,number,number]}){
  const ref=useRef<THREE.Group>(null);
  useFrame(({clock})=>{if(ref.current){ref.current.position.x=position[0]+Math.sin(clock.elapsedTime*.5)*.6;ref.current.rotation.y=Math.sin(clock.elapsedTime*.3)*.4;}});
  return <group ref={ref} position={position} rotation={[0,.8,0]}>
    <mesh position={[0,.5,0]} castShadow><boxGeometry args={[.4,.45,.9]}/><meshStandardMaterial color={c.dark}/></mesh>
    <mesh position={[0,.78,.48]} castShadow><boxGeometry args={[.35,.36,.45]}/><meshStandardMaterial color={c.rock}/></mesh>
    {[-.14,.14].map(x=><group key={x}><mesh position={[x,.22,.3]}><boxGeometry args={[.1,.45,.12]}/><meshStandardMaterial color={c.dark}/></mesh><mesh position={[x,.22,-.3]}><boxGeometry args={[.1,.45,.12]}/><meshStandardMaterial color={c.dark}/></mesh><mesh position={[x,1,.4]}><coneGeometry args={[.1,.25,3]}/><meshStandardMaterial color={c.dark}/></mesh></group>)}
    <mesh position={[0,.6,-.6]} rotation={[.9,0,0]}><boxGeometry args={[.12,.12,.6]}/><meshStandardMaterial color={c.dark}/></mesh>
  </group>;
}
function WorldScene(props: WorldProps & {c:Palette}) {
  const {c}=props; const target=useRef(new THREE.Vector3(0,0,1)); const {camera,size}=useThree();
  useEffect(()=>{camera.lookAt(0,0,0);if(camera instanceof THREE.OrthographicCamera)camera.zoom=Math.max(12,Math.min(33,size.width/32));camera.updateProjectionMatrix();},[camera,size.width]);
  const trees=useMemo(()=>Array.from({length:105},(_,i)=>({x:(rand(i+1)-.5)*54,z:(rand(i+301)-.5)*48,size:.7+rand(i+701)*.65,seed:i})).filter(p=>Math.abs(p.x)>4.5||Math.abs(p.z)>10).filter(p=>!(p.x>2&&p.x<12&&p.z< -3&&p.z> -13)),[]);
  const path=useMemo(()=>{const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-18,.025,12),new THREE.Vector3(-7,.025,6),new THREE.Vector3(0,.025,1),new THREE.Vector3(4,.025,-3),new THREE.Vector3(7,.025,-8),new THREE.Vector3(16,.025,-14)]);const pts=curve.getPoints(70);const v:number[]=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];if(!a||!b)continue;const d=b.clone().sub(a).normalize(),p=new THREE.Vector3(-d.z,0,d.x).multiplyScalar(.95);const q=[a.clone().add(p),a.clone().sub(p),b.clone().add(p),b.clone().add(p),a.clone().sub(p),b.clone().sub(p)];q.forEach(n=>v.push(n.x,n.y,n.z));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return g;},[]);
  return <>
    <color attach="background" args={[c.ground]}/><fog attach="fog" args={[c.ground,42,80]}/>
    <ambientLight intensity={1.5} color={c.light}/><directionalLight position={[-12,25,8]} intensity={2.8} color={c.light} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-28} shadow-camera-right={28} shadow-camera-top={28} shadow-camera-bottom={-28} shadow-bias={-.001}/>
    <mesh rotation={[-Math.PI/2,0,0]} receiveShadow onPointerDown={e=>{e.stopPropagation();if(!props.paused)target.current.set(e.point.x,0,e.point.z);}}><planeGeometry args={[160,160]}/><meshStandardMaterial color={c.ground}/></mesh>
    <mesh geometry={path} receiveShadow><meshStandardMaterial color={c.path} side={THREE.DoubleSide}/></mesh>
    <mesh position={[-10,.05,-2]} rotation={[-Math.PI/2,0,.35]}><planeGeometry args={[5,70]}/><meshStandardMaterial color={c.water} roughness={.3}/></mesh>
    {Array.from({length:17},(_,i)=><mesh key={`water${i}`} position={[-10+(rand(i+50)-.5)*3,.07,(rand(i+80)-.5)*40]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.4+rand(i)*1.2,.05]}/><meshBasicMaterial color={c['water-light']} transparent opacity={.35}/></mesh>)}
    <group position={[-9,.19,7]} rotation={[0,-.35,0]}>{Array.from({length:16},(_,i)=><mesh key={i} position={[(i-8)*.35,0,0]} receiveShadow castShadow><boxGeometry args={[.32,.18,2.1]}/><meshStandardMaterial color={i%2?c.trunk:c.path}/></mesh>)}</group>
    {trees.map((p,i)=><Tree key={i} {...p} c={c}/>)}
    {Array.from({length:65},(_,i)=><Rock key={i} x={(rand(i+911)-.5)*45} z={(rand(i+1200)-.5)*42} size={.3+rand(i+90)} c={c}/>)}
    {Array.from({length:220},(_,i)=><mesh key={`grass${i}`} position={[(rand(i+1400)-.5)*48,.1,(rand(i+1900)-.5)*44]} rotation={[0,rand(i)*6,0]}><coneGeometry args={[.09,.35,3]}/><meshStandardMaterial color={c.grass}/></mesh>)}
    <Ruins c={c}/>
    <group position={[-3,0,-2]} onClick={e=>{e.stopPropagation();props.onCollect();}}>
      <Rock x={0} z={0} size={1.25} c={c}/>{[-.4,0,.4].map((x,i)=><mesh key={x} position={[x,.9+i*.1,.1]} rotation={[0,0,x]} castShadow><coneGeometry args={[.18,.9,5]}/><meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={.25}/></mesh>)}
    </group>
    <group position={[2,.2,3]} onClick={e=>{e.stopPropagation();props.onCollect();}}><mesh castShadow><boxGeometry args={[.65,.4,.42]}/><meshStandardMaterial color={c.trunk}/></mesh><mesh position={[0,.13,.22]}><boxGeometry args={[.09,.18,.025]}/><meshStandardMaterial color={c.gold}/></mesh></group>
    <Wolf c={c} position={[-3,0,5]}/><Wolf c={c} position={[5,0,1]}/>
    <group position={[4,0,5]}><mesh position={[0,1,0]}><cylinderGeometry args={[.3,.5,2,6]}/><meshStandardMaterial color={c.rock}/></mesh><mesh position={[0,2.3,0]}><octahedronGeometry args={[.4,0]}/><meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={.4}/></mesh></group>
    <Character c={c} attack={props.attack} movement={target} onPosition={props.onPosition} paused={props.paused}/>
  </>;
}
export default function GameWorld(props:WorldProps) {
  const c=useMemo(palette,[]);
  return <Canvas shadows dpr={[1,1.5]} gl={{antialias:true}}><OrthographicCamera makeDefault position={[24,29,24]} zoom={33} near={.1} far={140}/><WorldScene {...props} c={c}/></Canvas>;
}