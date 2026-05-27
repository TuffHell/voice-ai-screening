"use client";
/**
 * Cinematic 3D background scene.
 *
 * Built with react-three-fiber. The scene is composed deliberately so the
 * visitor "feels" before reading a word:
 *
 *   • Deep volumetric fog → enclosed clinical space, calm.
 *   • Hex-grid floor receding to horizon → architectural precision.
 *   • Slow camera drift with pointer parallax → reactive but never frantic.
 *   • A single soft cold-blue key light → singular focus, "operating-room blue".
 *   • Drifting dust motes in the air → depth, scale, mystery.
 *   • Bloom + tone mapping → the cinematic finish.
 *
 * Renders on the GPU at native refresh rate. Cheaper than the canvas-2D
 * neural network because three.js batches everything into a few draw calls.
 */
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type GroupProps, type Vector3 } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

/* ─── A single hex tile, instanced into a receding grid ─────────────────── */
function HexFloor() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COLS = 32;
  const ROWS = 32;
  const HEX_R = 0.55;       // tile radius
  const Y_OFF = -3.2;       // floor depth

  // Build a thin hex prism — InstancedMesh is far cheaper than rendering
  // 1 000+ separate meshes; one draw call total.
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(HEX_R, HEX_R, 0.05, 6);
    return g;
  }, []);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#1a3a6b"),
        emissive: new THREE.Color("#142a55"),
        emissiveIntensity: 0.25,
        metalness: 0.6,
        roughness: 0.55,
      }),
    []
  );

  // Place tiles in a flat-top hex grid; record their distance from origin
  // for the gentle wave animation.
  const dists = useMemo(() => {
    const arr: number[] = [];
    const dummy = new THREE.Object3D();
    let i = 0;
    for (let r = -ROWS / 2; r < ROWS / 2; r++) {
      for (let c = -COLS / 2; c < COLS / 2; c++) {
        const x = c * HEX_R * Math.sqrt(3) + (r % 2 ? HEX_R * Math.sqrt(3) / 2 : 0);
        const z = r * HEX_R * 1.5;
        const d = Math.sqrt(x * x + z * z);
        arr.push(d);
        dummy.position.set(x, Y_OFF, z);
        dummy.updateMatrix();
        ref.current?.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    let i = 0;
    for (let r = -ROWS / 2; r < ROWS / 2; r++) {
      for (let c = -COLS / 2; c < COLS / 2; c++) {
        const x = c * HEX_R * Math.sqrt(3) + (r % 2 ? HEX_R * Math.sqrt(3) / 2 : 0);
        const z = r * HEX_R * 1.5;
        const d = dists[i];
        const y = Y_OFF + Math.sin(t * 0.55 - d * 0.4) * 0.06;
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        ref.current.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, COLS * ROWS]} />;
}

/* ─── Drifting dust motes — gives the scene scale and slow life ─────────── */
function Motes({ count = 420 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);

  const { positions, basePositions, speeds } = useMemo(() => {
    const p   = new Float32Array(count * 3);
    const bp  = new Float32Array(count * 3);
    const sp  = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r  = Math.random();
      const a  = Math.random() * Math.PI * 2;
      const x  = Math.cos(a) * (3 + r * 18);
      const z  = Math.sin(a) * (3 + r * 18);
      const y  = -1 + Math.random() * 8;
      p[i * 3]     = bp[i * 3]     = x;
      p[i * 3 + 1] = bp[i * 3 + 1] = y;
      p[i * 3 + 2] = bp[i * 3 + 2] = z;
      sp[i]        = 0.2 + Math.random() * 0.8;
    }
    return { positions: p, basePositions: bp, speeds: sp };
  }, [count]);

  const mat = useMemo(
    () => new THREE.PointsMaterial({
      size: 0.045,
      color: new THREE.Color("#c0d4ff"),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    }), []);

  useFrame((s) => {
    if (!points.current) return;
    const t = s.clock.getElapsedTime();
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr  = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const sp = speeds[i];
      arr[i * 3]     = basePositions[i * 3]     + Math.sin(t * 0.15 * sp + i)       * 0.6;
      arr[i * 3 + 1] = basePositions[i * 3 + 1] + Math.sin(t * 0.10 * sp + i * 0.7) * 0.5;
      arr[i * 3 + 2] = basePositions[i * 3 + 2] + Math.cos(t * 0.12 * sp + i * 0.3) * 0.6;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <primitive object={mat} attach="material" />
    </points>
  );
}

/* ─── A single soft volumetric key light source up ahead ────────────────── */
function FocalLight() {
  return (
    <group position={[0, 4, -6]}>
      <pointLight color="#5fa0ff" intensity={45} distance={26} decay={1.6} />
      {/* Visible source — a soft sphere mesh with additive glow */}
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color="#cfe2ff" transparent opacity={0.65} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#3a6cd1" transparent opacity={0.18} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/* ─── Camera drift + pointer parallax ───────────────────────────────────── */
function CameraRig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  const camPos = useRef({ x: 0, y: 1.4, z: 6.4 });

  // The Canvas's <camera> can be reached via useThree
  const { camera } = useThree();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // pointer parallax (slow, gentle)
    camera.position.x += (target.current.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (1.4 + target.current.y * 0.3 - camera.position.y) * 0.04;
    camera.position.z = 6.4 + Math.sin(t * 0.06) * 0.4;
    camera.lookAt(0, 1.2, -6);
  });

  return (
    <group
      ref={ref}
      onPointerMove={(e) => {
        // r3f's onPointerMove gives canvas coords; convert to -1..1
        const w = e.nativeEvent.target as HTMLCanvasElement;
        const x = (e.nativeEvent.offsetX / w.clientWidth)  * 2 - 1;
        const y = (e.nativeEvent.offsetY / w.clientHeight) * 2 - 1;
        target.current = { x, y: -y };
      }}
    >
      {children}
    </group>
  );
}

/* ─── The composed scene ────────────────────────────────────────────────── */
export default function CinematicScene() {
  return (
    <div className="fixed inset-0 -z-[1] pointer-events-none">
      <Canvas
        dpr={[1, 1.5]}                  // cap pixel ratio — huge perf win on retina
        camera={{ position: [0, 1.4, 6.4], fov: 55 }}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
      >
        <color attach="background" args={["#050810"]} />
        <fog attach="fog" args={["#050810", 5, 26]} />

        <ambientLight intensity={0.15} color="#243a66" />
        <directionalLight position={[3, 8, 4]} intensity={0.55} color="#dbe7ff" />

        <Suspense fallback={null}>
          <CameraRig>
            <HexFloor />
            <Motes />
            <FocalLight />
          </CameraRig>

          <EffectComposer multisampling={0}>
            <Bloom
              intensity={1.4}
              luminanceThreshold={0.25}
              luminanceSmoothing={0.7}
              mipmapBlur
            />
            <ChromaticAberration
              offset={new THREE.Vector2(0.0005, 0.0005)}
              radialModulation={false}
              modulationOffset={0}
              blendFunction={BlendFunction.NORMAL}
            />
            <Vignette eskil={false} offset={0.05} darkness={0.75} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
