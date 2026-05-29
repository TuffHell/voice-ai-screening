"use client";
/**
 * Real animated 3D ocean — Three.js `Water` + `Sky` + sun + floating buoys.
 *
 * This is the canonical three.js ocean (normal-mapped animated water with
 * live sun reflection and a physically-based atmospheric sky), tuned to a
 * calm dusk mood so white/gold hero text stays readable. A handful of small
 * buoys bob and drift on the surface to give the scene life and scale.
 *
 * Vanilla three.js (own renderer + RAF loop) for full control. Cleans up
 * on unmount. Pixel-ratio capped for smooth performance on laptops.
 */
import { useEffect, useRef } from "react";
import type * as T3 from "three";

export default function OceanScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mountRef.current) return;
    const mount = mountRef.current;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      const { Water } = await import("three/examples/jsm/objects/Water.js");
      const { Sky }   = await import("three/examples/jsm/objects/Sky.js");
      if (disposed || !mount) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.52;   // calm, not blown out
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        52, window.innerWidth / window.innerHeight, 1, 20000,
      );
      camera.position.set(0, 18, 110);

      const sun = new THREE.Vector3();

      // ── Water ───────────────────────────────────────────────────────
      const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
      const waterNormals = new THREE.TextureLoader().load("/waternormals.jpg", (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      });
      const water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals,
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffe9c0,
        waterColor: 0x0a2a3a,        // deep teal-navy
        distortionScale: 3.4,
        fog: false,
      });
      water.rotation.x = -Math.PI / 2;
      scene.add(water);

      // ── Sky ─────────────────────────────────────────────────────────
      const sky = new Sky();
      sky.scale.setScalar(10000);
      scene.add(sky);
      const skyU = sky.material.uniforms;
      skyU["turbidity"].value = 8;
      skyU["rayleigh"].value = 1.6;
      skyU["mieCoefficient"].value = 0.006;
      skyU["mieDirectionalG"].value = 0.85;

      // Low dusk sun to the right (keeps left-aligned hero text over darker water)
      const elevation = 3.5;   // degrees above horizon — low, golden
      const azimuth   = 215;   // degrees — sun toward upper-right
      const phi   = THREE.MathUtils.degToRad(90 - elevation);
      const theta = THREE.MathUtils.degToRad(azimuth);
      sun.setFromSphericalCoords(1, phi, theta);
      skyU["sunPosition"].value.copy(sun);
      water.material.uniforms["sunDirection"].value.copy(sun).normalize();

      // ── Floating buoys — bob + drift to give the scene life ─────────
      type Buoy = { mesh: T3.Mesh; x: number; z: number; phase: number; bobAmp: number; bobSpeed: number };
      const buoys: Buoy[] = [];
      const buoyMat = new THREE.MeshStandardMaterial({
        color: 0x1a1c22, roughness: 0.5, metalness: 0.3,
        emissive: 0xc9a86a, emissiveIntensity: 0.25,
      });
      const positions: Array<[number, number]> = [
        [-60, -30], [40, -80], [-110, -140], [90, -180], [10, -50],
      ];
      for (const [x, z] of positions) {
        const g = new THREE.IcosahedronGeometry(2.2 + Math.random() * 1.5, 0);
        const mesh = new THREE.Mesh(g, buoyMat);
        mesh.position.set(x, 0, z);
        scene.add(mesh);
        // A tiny warm beacon light atop each buoy
        const light = new THREE.PointLight(0xffd89b, 6, 60, 2);
        light.position.set(0, 4, 0);
        mesh.add(light);
        buoys.push({
          mesh, x, z,
          phase: Math.random() * Math.PI * 2,
          bobAmp: 1.6 + Math.random() * 1.2,
          bobSpeed: 0.6 + Math.random() * 0.5,
        });
      }

      // Ambient + key fill so buoys read against the water
      scene.add(new THREE.AmbientLight(0x335577, 0.4));
      const key = new THREE.DirectionalLight(0xffe9c0, 0.5);
      key.position.copy(sun).multiplyScalar(100);
      scene.add(key);

      // ── Interaction: gentle mouse parallax on the camera ────────────
      let targetYaw = 0, targetPitch = 0;
      let yaw = 0, pitch = 0;
      const onMove = (e: PointerEvent) => {
        targetYaw   = (e.clientX / window.innerWidth  - 0.5) * 0.25;
        targetPitch = (e.clientY / window.innerHeight - 0.5) * 0.10;
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      let raf = 0;

      const animate = () => {
        const t = clock.getElapsedTime();

        // Animate the water surface
        water.material.uniforms["time"].value += 1 / 60;

        // Bob + slow-spin the buoys
        for (const b of buoys) {
          b.mesh.position.y = Math.sin(t * b.bobSpeed + b.phase) * b.bobAmp;
          b.mesh.rotation.x = Math.sin(t * b.bobSpeed * 0.7 + b.phase) * 0.12;
          b.mesh.rotation.z = Math.cos(t * b.bobSpeed * 0.5 + b.phase) * 0.12;
          b.mesh.rotation.y += 0.002;
        }

        // Eased mouse-parallax camera
        yaw   += (targetYaw   - yaw)   * 0.04;
        pitch += (targetPitch - pitch) * 0.04;
        camera.position.x = Math.sin(yaw) * 110;
        camera.position.z = Math.cos(yaw) * 110;
        camera.position.y = 18 + pitch * 30 + Math.sin(t * 0.15) * 2.5;
        camera.lookAt(0, 6, -40);

        renderer.render(scene, camera);
        if (!reduced) raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        waterGeometry.dispose();
        waterNormals.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    })().catch((err) => console.error("[OceanScene] init failed:", err));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{ width: "100vw", height: "100vh", zIndex: 0 }}
      />
      {/* Readability overlay — darkens left + bottom where hero text sits,
          and the very top so the bright horizon never blows out headings. */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(90deg, rgba(2,6,14,0.72) 0%, rgba(2,6,14,0.30) 42%, rgba(2,6,14,0.05) 70%, transparent 100%)," +
            "linear-gradient(180deg, rgba(2,6,14,0.45) 0%, transparent 22%, transparent 55%, rgba(2,6,14,0.55) 100%)",
        }}
      />
    </>
  );
}
