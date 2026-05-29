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
        sunColor: 0xcdf6ff,           // cool clinical cyan-white
        waterColor: 0x05222b,         // deep clinical teal
        distortionScale: 3.0,
        fog: false,
      });
      water.rotation.x = -Math.PI / 2;
      scene.add(water);

      // ── Sky ─────────────────────────────────────────────────────────
      const sky = new Sky();
      sky.scale.setScalar(10000);
      scene.add(sky);
      const skyU = sky.material.uniforms;
      skyU["turbidity"].value = 5;        // cleaner, less warm scatter
      skyU["rayleigh"].value = 0.9;       // cooler sky
      skyU["mieCoefficient"].value = 0.004;
      skyU["mieDirectionalG"].value = 0.82;

      // A higher, cooler sun → clean clinical light rather than warm dusk
      const elevation = 9;     // degrees above horizon — cool daylight glow
      const azimuth   = 200;   // degrees — light toward upper-right
      const phi   = THREE.MathUtils.degToRad(90 - elevation);
      const theta = THREE.MathUtils.degToRad(azimuth);
      sun.setFromSphericalCoords(1, phi, theta);
      skyU["sunPosition"].value.copy(sun);
      water.material.uniforms["sunDirection"].value.copy(sun).normalize();

      // ── Floating cell / molecular nodes — bob, drift, and pulse ─────
      // Reads as biological cells suspended in a clinical fluid: each is a
      // translucent teal sphere that breathes (scale oscillation) and carries
      // a soft cyan beacon, suggesting living signal sources on the surface.
      type Cell = {
        mesh: T3.Mesh; x: number; z: number;
        phase: number; bobAmp: number; bobSpeed: number; baseScale: number;
      };
      const cells: Cell[] = [];
      const cellMat = new THREE.MeshStandardMaterial({
        color: 0x0a2e34, roughness: 0.35, metalness: 0.2,
        emissive: 0x2dd4bf, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.92,
      });
      const positions: Array<[number, number]> = [
        [-60, -30], [40, -80], [-110, -140], [90, -180], [10, -50], [-30, -120],
      ];
      for (const [x, z] of positions) {
        const baseScale = 2.0 + Math.random() * 1.6;
        const g = new THREE.SphereGeometry(baseScale, 24, 24);
        const mesh = new THREE.Mesh(g, cellMat);
        mesh.position.set(x, 0, z);
        scene.add(mesh);
        // Soft cyan beacon at each cell
        const light = new THREE.PointLight(0x5fe8d6, 7, 70, 2);
        light.position.set(0, 3, 0);
        mesh.add(light);
        cells.push({
          mesh, x, z,
          phase: Math.random() * Math.PI * 2,
          bobAmp: 1.6 + Math.random() * 1.2,
          bobSpeed: 0.6 + Math.random() * 0.5,
          baseScale,
        });
      }

      // Ambient + cool key fill so cells read against the teal fluid
      scene.add(new THREE.AmbientLight(0x1d6b6b, 0.4));
      const key = new THREE.DirectionalLight(0xcdf6ff, 0.5);
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

      // ── Scroll: camera rises + tilts down as the page scrolls, so the
      //    ocean feels physically connected to the scroll position ──────
      let scroll = 0, scrollTarget = 0;
      const onScroll = () => {
        const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
        scrollTarget = Math.min(1, window.scrollY / max);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

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

        // Bob, drift + pulse (breathe) the cell nodes
        for (const c of cells) {
          c.mesh.position.y = Math.sin(t * c.bobSpeed + c.phase) * c.bobAmp;
          const pulse = 1 + 0.12 * Math.sin(t * 1.4 + c.phase);
          c.mesh.scale.setScalar(pulse);
          c.mesh.rotation.y += 0.0015;
        }

        // Eased mouse-parallax + scroll-driven camera
        yaw    += (targetYaw    - yaw)    * 0.04;
        pitch  += (targetPitch  - pitch)  * 0.04;
        scroll += (scrollTarget - scroll) * 0.06;

        // As you scroll: camera rises (10 → 80), dollies back (110 → 230),
        // and a slow orbit drift sets in — the ocean opens up beneath you.
        const orbit = yaw + scroll * 0.5;
        const radius = 110 + scroll * 120;
        camera.position.x = Math.sin(orbit) * radius;
        camera.position.z = Math.cos(orbit) * radius;
        camera.position.y = 14 + scroll * 70 + pitch * 30 + Math.sin(t * 0.15) * 2.5;
        camera.lookAt(0, 6 - scroll * 10, -40);

        renderer.render(scene, camera);
        if (!reduced) raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll", onScroll);
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
