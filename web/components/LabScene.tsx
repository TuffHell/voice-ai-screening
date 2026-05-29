"use client";
/**
 * Serene botanical research-lab scene (Three.js).
 *
 * A calm, well-lit lab full of plants: soft daylight from a bright window
 * behind, layered foliage (potted plants on the bench, tall plants in the
 * corners, hanging vines up top) gently swaying, a few researchers working
 * at the bench, fine drifting motes, and a soft bloom finish.
 *
 * Multi-phase scroll camera: dolly-in → lateral pan across the plants →
 * rise for an elevated view. Mouse parallax layered on top.
 *
 * Clinical-teal + botanical-green palette. Bright enough to read clearly,
 * dim enough on the left that white hero text stays legible.
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
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      // Visible deep teal-green atmosphere (not black) with soft depth fog
      scene.background = new THREE.Color(0x0a2620);
      scene.fog = new THREE.FogExp2(0x0c2a22, 0.0075);

      const camera = new THREE.PerspectiveCamera(
        52, window.innerWidth / window.innerHeight, 0.1, 800,
      );
      camera.position.set(0, 7, 44);

      // ── Lighting — bright, serene daylight ───────────────────────────
      scene.add(new THREE.HemisphereLight(0xbff0d4, 0x10241c, 1.1));
      scene.add(new THREE.AmbientLight(0x2f5a4c, 0.9));
      const daylight = new THREE.DirectionalLight(0xe6fff0, 1.5);
      daylight.position.set(-30, 60, -10);
      scene.add(daylight);
      const fill = new THREE.DirectionalLight(0x9fe8d6, 0.6);
      fill.position.set(40, 20, 30);
      scene.add(fill);

      // ── Soft window glow backdrop (the daylight source) ──────────────
      const makeGlow = (): T3.Texture => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const ctx = c.getContext("2d")!;
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.3, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
      };
      const glowTex = makeGlow();
      const windowGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xeafff3, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
      }));
      windowGlow.position.set(20, 34, -120);
      windowGlow.scale.setScalar(160);
      scene.add(windowGlow);

      // Soft bokeh fill orbs for depth (pale, not dominant)
      type Orb = { sp: T3.Sprite; bx: number; by: number; ph: number; sp2: number };
      const orbs: Orb[] = [];
      const orbColors = [0x7ff0e0, 0xa8f0c8, 0xcdf6ff, 0x58c08a];
      for (let i = 0; i < 28; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color: orbColors[i % orbColors.length], transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.10 + Math.random() * 0.18,
        }));
        const bx = (Math.random() - 0.5) * 230;
        const by = 4 + Math.random() * 56;
        sp.position.set(bx, by, -50 - Math.random() * 110);
        sp.scale.setScalar(8 + Math.random() * 22);
        scene.add(sp);
        orbs.push({ sp, bx, by, ph: Math.random() * 6.28, sp2: 0.4 + Math.random() * 0.7 });
      }

      // ── Plant builders ───────────────────────────────────────────────
      const greens = [0x2f8d5e, 0x3fa776, 0x57c08a, 0x6fce98, 0x248a6a];
      type Swayer = { obj: T3.Object3D; ph: number; amp: number; spd: number };
      const swayers: Swayer[] = [];

      const leafGeo = new THREE.ConeGeometry(0.9, 5.2, 5);   // tapered leaf

      const makePlant = (x: number, z: number, scale: number, leafCount: number, droop: number): void => {
        const group = new THREE.Group();
        // pot
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(1.8, 1.3, 2.6, 12),
          new THREE.MeshStandardMaterial({ color: 0x14302a, roughness: 0.85 }),
        );
        pot.position.y = 1.3;
        group.add(pot);
        // leaves fanning out
        for (let i = 0; i < leafCount; i++) {
          const col = greens[i % greens.length];
          const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({
            color: col, roughness: 0.65, emissive: col, emissiveIntensity: 0.14,
            side: THREE.DoubleSide,
          }));
          const a = (i / leafCount) * Math.PI * 2;
          const tilt = 0.5 + Math.random() * 0.5;
          leaf.position.set(Math.cos(a) * 0.6, 3.4, Math.sin(a) * 0.6);
          leaf.rotation.set(
            Math.cos(a) * tilt - droop,
            -a,
            Math.sin(a) * tilt + droop,
          );
          leaf.scale.set(1, 0.9 + Math.random() * 0.5, 0.35);  // flatten into leaf
          group.add(leaf);
        }
        group.position.set(x, 0, z);
        group.scale.setScalar(scale);
        scene.add(group);
        swayers.push({ obj: group, ph: Math.random() * 6.28, amp: 0.03 + Math.random() * 0.03, spd: 0.5 + Math.random() * 0.4 });
      };

      const makeHanging = (x: number, z: number, scale: number): void => {
        const group = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const col = greens[i % greens.length];
          const v = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({
            color: col, roughness: 0.65, emissive: col, emissiveIntensity: 0.12, side: THREE.DoubleSide,
          }));
          const a = (i / 9) * Math.PI * 2;
          v.position.set(Math.cos(a) * 1.2, -2 - Math.random() * 2, Math.sin(a) * 1.2);
          v.rotation.set(Math.PI + (Math.random() - 0.5) * 0.5, a, 0);   // point down
          v.scale.set(0.8, 1.4 + Math.random(), 0.3);
          group.add(v);
        }
        group.position.set(x, 50, z);
        group.scale.setScalar(scale);
        scene.add(group);
        swayers.push({ obj: group, ph: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.04, spd: 0.6 + Math.random() * 0.4 });
      };

      // Lots of plants: foreground potted, tall corners, scattered mid, hanging row
      makePlant(-26, 8, 2.4, 12, 0.2);    // big foreground left
      makePlant(28, 6, 2.6, 13, 0.15);    // big foreground right
      makePlant(-40, -10, 3.2, 14, 0.1);  // tall corner left
      makePlant(46, -14, 3.4, 14, 0.1);   // tall corner right
      makePlant(-12, -2, 1.6, 10, 0.3);
      makePlant(12, -4, 1.5, 10, 0.3);
      makePlant(-55, -40, 4.0, 14, 0.05); // distant tall
      makePlant(58, -46, 4.2, 14, 0.05);
      makePlant(0, -55, 3.0, 13, 0.1);
      makePlant(-30, -70, 3.8, 14, 0.05);
      makePlant(34, -78, 3.9, 14, 0.05);
      for (let i = 0; i < 7; i++) makeHanging(-60 + i * 20, -60 - (i % 3) * 10, 1.6 + Math.random());

      // ── Bench + silhouette researchers (lit against the glow) ────────
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(150, 3.4, 7),
        new THREE.MeshStandardMaterial({ color: 0x12302a, roughness: 0.7, metalness: 0.1 }),
      );
      bench.position.set(0, 2.0, -22);
      scene.add(bench);

      type Person = { group: T3.Group; ph: number; sway: number; arm: T3.Mesh; armPh: number };
      const people: Person[] = [];
      const silMat = new THREE.MeshStandardMaterial({ color: 0x0a2018, roughness: 0.9, emissive: 0x0a1f18, emissiveIntensity: 0.2 });
      for (const px of [-30, -15, 2, 18, 33]) {
        const g = new THREE.Group();
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.4, 6, 12), silMat);
        torso.position.y = 4.0; g.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 16), silMat);
        head.position.y = 7.4; g.add(head);
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.6, 4, 8), silMat);
        arm.position.set(1.3, 4.4, 0.4); arm.rotation.z = -0.7; g.add(arm);
        g.position.set(px + (Math.random() - 0.5) * 3, 0, -28 - Math.random() * 6);
        g.scale.setScalar(0.9 + Math.random() * 0.25);
        scene.add(g);
        people.push({ group: g, ph: Math.random() * 6.28, sway: 0.5 + Math.random() * 0.4, arm, armPh: Math.random() * 6.28 });
      }

      // ── Drifting motes ───────────────────────────────────────────────
      const moteCount = 220;
      const mpos = new Float32Array(moteCount * 3);
      const mbase = new Float32Array(moteCount * 3);
      for (let i = 0; i < moteCount; i++) {
        const x = (Math.random() - 0.5) * 200, y = Math.random() * 55, z = -10 - Math.random() * 130;
        mpos[i*3]=mbase[i*3]=x; mpos[i*3+1]=mbase[i*3+1]=y; mpos[i*3+2]=mbase[i*3+2]=z;
      }
      const moteGeo = new THREE.BufferGeometry();
      moteGeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
      const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
        size: 0.45, map: glowTex, color: 0xcdf6e8, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      scene.add(motes);

      // ── Subtle bloom ─────────────────────────────────────────────────
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.35,
      ));

      // ── Interaction: mouse parallax + multi-phase scroll camera ──────
      let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
      const onMove = (e: PointerEvent) => {
        targetYaw   = (e.clientX / window.innerWidth  - 0.5) * 0.16;
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
      const sstep = THREE.MathUtils.smoothstep;

      const animate = () => {
        const t = clock.getElapsedTime();

        for (const o of orbs) {
          o.sp.position.x = o.bx + Math.sin(t * 0.1 * o.sp2 + o.ph) * 3;
          o.sp.position.y = o.by + Math.cos(t * 0.08 * o.sp2 + o.ph) * 2;
        }
        for (const s of swayers) {
          s.obj.rotation.z = Math.sin(t * s.spd + s.ph) * s.amp;
          s.obj.rotation.x = Math.cos(t * s.spd * 0.7 + s.ph) * s.amp * 0.6;
        }
        for (const p of people) {
          p.group.rotation.z = Math.sin(t * p.sway + p.ph) * 0.04;
          p.group.position.y = Math.sin(t * p.sway * 0.8 + p.ph) * 0.22;
          p.arm.rotation.z = -0.7 + Math.sin(t * 1.6 + p.armPh) * 0.25;
        }
        const arr = moteGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          arr[i*3]   = mbase[i*3]   + Math.sin(t * 0.12 + i) * 1.2;
          arr[i*3+1] = mbase[i*3+1] + ((t * 1.2 + i * 0.3) % 55);
          arr[i*3+2] = mbase[i*3+2] + Math.cos(t * 0.1 + i) * 1.0;
        }
        moteGeo.attributes.position.needsUpdate = true;

        yaw    += (targetYaw    - yaw)    * 0.04;
        pitch  += (targetPitch  - pitch)  * 0.04;
        scroll += (scrollTarget - scroll) * 0.06;

        // Three-phase choreography:
        const p1 = sstep(scroll, 0.0, 0.4);    // dolly into the room
        const p2 = sstep(scroll, 0.32, 0.74);  // lateral pan across the plants
        const p3 = sstep(scroll, 0.68, 1.0);   // rise for an elevated view

        camera.position.z = 44 - p1 * 24 - p3 * 4;
        camera.position.x = Math.sin(yaw) * 10 + (p2 - 0.5) * 46;
        camera.position.y = 7 + p3 * 20 + pitch * 16 + Math.sin(t * 0.14) * 1.0;
        camera.lookAt((p2 - 0.5) * 24, 6 - p3 * 3.5, -34);

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
        leafGeo.dispose();
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
      {/* Readability overlay — only darkens the left third + a soft bottom,
          so the scene stays bright and visible but hero text still reads. */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(90deg, rgba(4,14,11,0.74) 0%, rgba(4,14,11,0.34) 40%, transparent 70%)," +
            "linear-gradient(180deg, rgba(4,14,11,0.30) 0%, transparent 30%, transparent 64%, rgba(4,14,11,0.45) 100%)",
        }}
      />
    </>
  );
}
