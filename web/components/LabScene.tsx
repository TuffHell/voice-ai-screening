"use client";
/**
 * Cinematic science-lab background (Three.js).
 *
 * Reads as "a research lab at work, shot in shallow focus": soft out-of-focus
 * bokeh lights (equipment / monitors), silhouetted figures working at benches
 * in the mid-ground, drifting data motes, all finished with bloom. The
 * darkness + bokeh + bloom let simple geometry read as a real, deep space —
 * the same trick cinematographers use with shallow depth of field.
 *
 * Keeps the scroll-driven + mouse-parallax camera the previous scene used.
 * Clinical teal/cyan palette to match the biomedical theme.
 */
import { useEffect, useRef } from "react";
import type * as T3 from "three";

export default function LabScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mountRef.current) return;
    const mount = mountRef.current;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");
      if (disposed || !mount) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.85;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x030a0f, 0.012);

      const camera = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 600,
      );
      camera.position.set(0, 6, 42);

      // ── Soft radial sprite texture for bokeh + motes ─────────────────
      const makeGlow = (): T3.Texture => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const ctx = c.getContext("2d")!;
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0,   "rgba(255,255,255,1)");
        g.addColorStop(0.25,"rgba(255,255,255,0.6)");
        g.addColorStop(1,   "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        return tex;
      };
      const glowTex = makeGlow();

      // ── Bokeh field — out-of-focus equipment / monitor lights ────────
      // Big soft discs far back read as defocused lights; this is the
      // signature "shallow-focus lab at night" look.
      const bokehColors = [0x2dd4bf, 0x5fe8d6, 0x7ff0e0, 0x38bdf8, 0xcdf6ff, 0x1d9488];
      type Bokeh = { sp: T3.Sprite; baseX: number; baseY: number; drift: number; phase: number };
      const bokehs: Bokeh[] = [];
      for (let i = 0; i < 46; i++) {
        const col = bokehColors[i % bokehColors.length];
        const mat = new THREE.SpriteMaterial({
          map: glowTex, color: col, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
          opacity: 0.10 + Math.random() * 0.35,
        });
        const sp = new THREE.Sprite(mat);
        const depth = -40 - Math.random() * 120;          // far back
        const x = (Math.random() - 0.5) * 240;
        const y = -4 + Math.random() * 60;
        const size = 6 + Math.random() * 26;               // big = more defocused
        sp.position.set(x, y, depth);
        sp.scale.setScalar(size);
        scene.add(sp);
        bokehs.push({ sp, baseX: x, baseY: y, drift: 0.4 + Math.random() * 0.8, phase: Math.random() * 6.28 });
      }

      // ── Silhouette figures working at a bench (mid-ground) ───────────
      type Person = { group: T3.Group; phase: number; sway: number; armPhase: number; arm: T3.Mesh };
      const people: Person[] = [];
      const silMat = new THREE.MeshBasicMaterial({ color: 0x020809 });   // near-black silhouette
      const benchMat = new THREE.MeshBasicMaterial({ color: 0x05161b });
      const peopleX = [-34, -20, -7, 8, 22, 36];
      for (const px of peopleX) {
        const group = new THREE.Group();
        // torso (capsule)
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.4, 6, 12), silMat);
        torso.position.y = 4.0;
        group.add(torso);
        // head
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 16), silMat);
        head.position.y = 7.4;
        group.add(head);
        // one arm reaching toward the bench (animates → "working")
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.6, 4, 8), silMat);
        arm.position.set(1.3, 4.4, 0.4);
        arm.rotation.z = -0.7;
        group.add(arm);
        group.position.set(px + (Math.random() - 0.5) * 3, 0, -30 - Math.random() * 8);
        group.scale.setScalar(0.9 + Math.random() * 0.3);
        scene.add(group);
        people.push({
          group, phase: Math.random() * 6.28,
          sway: 0.5 + Math.random() * 0.5,
          armPhase: Math.random() * 6.28, arm,
        });
      }
      // Long bench in front of the figures
      const bench = new THREE.Mesh(new THREE.BoxGeometry(150, 3.5, 6), benchMat);
      bench.position.set(0, 2.2, -25);
      scene.add(bench);

      // ── Drifting data motes (fine particles) ─────────────────────────
      const moteCount = 260;
      const mpos = new Float32Array(moteCount * 3);
      const mbase = new Float32Array(moteCount * 3);
      for (let i = 0; i < moteCount; i++) {
        const x = (Math.random() - 0.5) * 200;
        const y = Math.random() * 55;
        const z = -10 - Math.random() * 130;
        mpos[i*3] = mbase[i*3] = x;
        mpos[i*3+1] = mbase[i*3+1] = y;
        mpos[i*3+2] = mbase[i*3+2] = z;
      }
      const moteGeo = new THREE.BufferGeometry();
      moteGeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
      const moteMat = new THREE.PointsMaterial({
        size: 0.5, map: glowTex, color: 0x9fe9df, transparent: true,
        opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const motes = new THREE.Points(moteGeo, moteMat);
      scene.add(motes);

      // Faint cool ambient so silhouettes keep their dark edge
      scene.add(new THREE.AmbientLight(0x0a1a1f, 1.0));

      // ── Bloom post — makes the bokeh + motes glow cinematically ──────
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.9,   // strength
        0.7,   // radius
        0.2,   // threshold
      );
      composer.addPass(bloom);

      // ── Interaction (mouse parallax + scroll dolly) — same as before ─
      let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
      const onMove = (e: PointerEvent) => {
        targetYaw   = (e.clientX / window.innerWidth  - 0.5) * 0.18;
        targetPitch = (e.clientY / window.innerHeight - 0.5) * 0.08;
      };
      window.addEventListener("pointermove", onMove, { passive: true });

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
        composer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      let raf = 0;

      const animate = () => {
        const t = clock.getElapsedTime();

        // Bokeh slow drift + gentle breathing opacity
        for (const b of bokehs) {
          b.sp.position.x = b.baseX + Math.sin(t * 0.1 * b.drift + b.phase) * 3.0;
          b.sp.position.y = b.baseY + Math.cos(t * 0.08 * b.drift + b.phase) * 2.0;
        }
        // People: idle sway + "working" arm motion
        for (const p of people) {
          p.group.rotation.z = Math.sin(t * p.sway + p.phase) * 0.04;
          p.group.position.y = Math.sin(t * p.sway * 0.8 + p.phase) * 0.25;
          p.arm.rotation.z = -0.7 + Math.sin(t * 1.6 + p.armPhase) * 0.25; // reaching/working
        }
        // Motes drift slowly upward + sideways
        const arr = moteGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          arr[i*3]   = mbase[i*3]   + Math.sin(t * 0.12 + i) * 1.2;
          arr[i*3+1] = mbase[i*3+1] + ((t * 1.5 + i * 0.3) % 55);
          arr[i*3+2] = mbase[i*3+2] + Math.cos(t * 0.1 + i) * 1.0;
        }
        moteGeo.attributes.position.needsUpdate = true;

        // Eased camera: mouse parallax + scroll push-in/rise
        yaw    += (targetYaw    - yaw)    * 0.04;
        pitch  += (targetPitch  - pitch)  * 0.04;
        scroll += (scrollTarget - scroll) * 0.06;

        camera.position.x = Math.sin(yaw) * 42 + scroll * 6;
        camera.position.z = 42 - scroll * 26;            // dolly forward into the lab
        camera.position.y = 6 + scroll * 14 + pitch * 16 + Math.sin(t * 0.15) * 1.2;
        camera.lookAt(0, 5 - scroll * 2, -30);

        composer.render();
        if (!reduced) raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        composer.dispose();
        renderer.dispose();
        glowTex.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    })().catch((err) => console.error("[LabScene] init failed:", err));

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{ width: "100vw", height: "100vh", zIndex: 0 }}
      />
      {/* Readability overlay — darkens left + top + bottom where text sits */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(90deg, rgba(3,8,12,0.78) 0%, rgba(3,8,12,0.34) 44%, rgba(3,8,12,0.06) 72%, transparent 100%)," +
            "linear-gradient(180deg, rgba(3,8,12,0.50) 0%, transparent 24%, transparent 52%, rgba(3,8,12,0.60) 100%)",
        }}
      />
    </>
  );
}
