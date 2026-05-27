"use client";
/**
 * Cinematic 3D background scene — v2.
 *
 * Composition changes from v1:
 *   • Removed the floating focal-sphere (read as a stray UI element)
 *   • Added downward volumetric light shafts ("god rays") above the scene
 *   • Added a *cursor-driven point light* that projects glow onto the floor
 *     and illuminates nearby dust motes — the pointer IS the focal element
 *   • Cut motes 420 → 240 and DPR cap 1.5 → 1.35 for smoother frame timing
 *
 * The opening shot now reads as a hushed, deep clinical chamber. When the
 * visitor moves their mouse, light follows — the scene reacts. No more
 * separate canvas-2D cursor overlay competing for paint time.
 */
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────────────────
 * Receding hex floor — instanced for one draw call total
 * ──────────────────────────────────────────────────────────────────────── */
function HexFloor() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COLS = 30;
  const ROWS = 30;
  const HEX_R = 0.55;
  const Y_OFF = -3.2;
  const total = COLS * ROWS;

  const geo = useMemo(() => new THREE.CylinderGeometry(HEX_R, HEX_R, 0.05, 6), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#162c4e"),
        emissive: new THREE.Color("#0e1f3d"),
        emissiveIntensity: 0.18,
        metalness: 0.55,
        roughness: 0.6,
      }),
    []
  );

  // Cache base x/z positions per index for the wave animation
  const basePositions = useMemo(() => {
    const arr: Array<{ x: number; z: number; d: number }> = [];
    for (let r = -ROWS / 2; r < ROWS / 2; r++) {
      for (let c = -COLS / 2; c < COLS / 2; c++) {
        const x = c * HEX_R * Math.sqrt(3) + (Math.abs(r) % 2 ? (HEX_R * Math.sqrt(3)) / 2 : 0);
        const z = r * HEX_R * 1.5;
        arr.push({ x, z, d: Math.sqrt(x * x + z * z) });
      }
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < total; i++) {
      const b = basePositions[i];
      const y = Y_OFF + Math.sin(t * 0.5 - b.d * 0.35) * 0.05;
      dummy.position.set(b.x, y, b.z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, total]} />;
}

/* ────────────────────────────────────────────────────────────────────────
 * Drifting motes — additive blending dust in the air
 * ──────────────────────────────────────────────────────────────────────── */
function Motes({ count = 240 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);
  const { positions, basePositions, speeds } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const bp = new Float32Array(count * 3);
    const sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * (3 + r * 16);
      const z = Math.sin(a) * (3 + r * 16);
      const y = -1 + Math.random() * 7;
      p[i * 3] = bp[i * 3] = x;
      p[i * 3 + 1] = bp[i * 3 + 1] = y;
      p[i * 3 + 2] = bp[i * 3 + 2] = z;
      sp[i] = 0.2 + Math.random() * 0.8;
    }
    return { positions: p, basePositions: bp, speeds: sp };
  }, [count]);

  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.05,
        color: new THREE.Color("#c8dcff"),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    []
  );

  useFrame((s) => {
    if (!points.current) return;
    const t = s.clock.getElapsedTime();
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const sp = speeds[i];
      arr[i * 3]     = basePositions[i * 3]     + Math.sin(t * 0.14 * sp + i)       * 0.55;
      arr[i * 3 + 1] = basePositions[i * 3 + 1] + Math.sin(t * 0.10 * sp + i * 0.7) * 0.45;
      arr[i * 3 + 2] = basePositions[i * 3 + 2] + Math.cos(t * 0.12 * sp + i * 0.3) * 0.55;
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

/* ────────────────────────────────────────────────────────────────────────
 * God-ray light shafts — soft vertical cones falling from above
 * ──────────────────────────────────────────────────────────────────────── */
function LightShafts() {
  // Three transparent cones with additive blending, gentle sway
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    refs.forEach((r, i) => {
      if (!r.current) return;
      r.current.rotation.z = Math.sin(t * 0.1 + i) * 0.05;
    });
  });
  const positions: Array<[number, number, number]> = [
    [-4, 5,  -4],
    [ 4, 5,  -3],
    [ 0, 6,  -8],
  ];
  return (
    <>
      {positions.map((p, i) => (
        <mesh key={i} ref={refs[i]} position={p} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[2.2, 9, 32, 1, true]} />
          <meshBasicMaterial
            color="#6c9eff"
            transparent
            opacity={0.06}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Cursor-driven 3D point light — the new focal element
 *
 * Casts soft cold-blue light onto the floor; lights up motes within range;
 * follows the pointer in screen space via an unprojected ray onto a Y=0 plane.
 * ──────────────────────────────────────────────────────────────────────── */
function CursorLight() {
  const lightRef = useRef<THREE.PointLight>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const target = useRef(new THREE.Vector3(0, 0.6, 0));
  const current = useRef(new THREE.Vector3(0, 0.6, 0));
  const { camera, mouse } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame(() => {
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, target.current);
    // Soft easing toward the cursor's world-space projection
    current.current.lerp(
      new THREE.Vector3(target.current.x, 0.6, target.current.z),
      0.14
    );
    if (lightRef.current) {
      lightRef.current.position.copy(current.current);
    }
    if (sphereRef.current) {
      sphereRef.current.position.copy(current.current);
    }
  });

  return (
    <group>
      <pointLight
        ref={lightRef}
        color="#7eb1ff"
        intensity={12}
        distance={10}
        decay={1.7}
      />
      {/* Tiny radiant marker — soft, additive, no visible solid disc */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.12, 24, 24]} />
        <meshBasicMaterial
          color="#cfe2ff"
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Camera — slow breathing drift + subtle pointer parallax
 * ──────────────────────────────────────────────────────────────────────── */
function CameraDrift() {
  const { camera, mouse } = useThree();
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const targetX = mouse.x * 0.6;
    const targetY = 1.4 + mouse.y * 0.3;
    camera.position.x += (targetX - camera.position.x) * 0.035;
    camera.position.y += (targetY - camera.position.y) * 0.035;
    camera.position.z = 6.6 + Math.sin(t * 0.05) * 0.35;
    camera.lookAt(0, 0.8, -4);
  });
  return null;
}

export default function CinematicScene() {
  return (
    <div className="fixed inset-0 -z-[1] pointer-events-none">
      <Canvas
        dpr={[1, 1.35]}
        camera={{ position: [0, 1.4, 6.6], fov: 55 }}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
      >
        <color attach="background" args={["#040711"]} />
        <fog attach="fog" args={["#040711", 6, 24]} />

        <ambientLight intensity={0.12} color="#2a3f6e" />
        <directionalLight position={[3, 9, 4]} intensity={0.4} color="#dde9ff" />

        <Suspense fallback={null}>
          <CameraDrift />
          <HexFloor />
          <Motes />
          <LightShafts />
          <CursorLight />

          <EffectComposer multisampling={0}>
            <Bloom
              intensity={1.2}
              luminanceThreshold={0.22}
              luminanceSmoothing={0.65}
              mipmapBlur
            />
            <ChromaticAberration
              offset={new THREE.Vector2(0.0004, 0.0004)}
              radialModulation={false}
              modulationOffset={0}
              blendFunction={BlendFunction.NORMAL}
            />
            <Vignette eskil={false} offset={0.08} darkness={0.78} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
