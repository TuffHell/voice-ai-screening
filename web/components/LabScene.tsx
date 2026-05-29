"use client";
/**
 * Modern botanical glasshouse — inspired by an Art-Nouveau conservatory,
 * adapted to a clean contemporary research-greenhouse feel (Three.js).
 *
 * Repeating arched iron-and-glass ribs recede down a hall toward a bright,
 * warm-green daylit far end. Lush layered planting: flower beds up front,
 * potted plants and conifers along the hall, hanging baskets from the arches.
 * A few researchers work at a clean bench. Soft volumetric haze + bloom.
 *
 * Scroll flies the camera FORWARD down the conservatory hall toward the
 * light, rising near the end. Mouse parallax layered on top.
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
      const { Water } = await import("three/examples/jsm/objects/Water.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed || !mount) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a2c1d);                 // warm deep green
      scene.fog = new THREE.FogExp2(0x213a26, 0.0055);             // hazy green depth

      const camera = new THREE.PerspectiveCamera(
        55, window.innerWidth / window.innerHeight, 0.1, 900,
      );
      camera.position.set(0, 8, 46);

      // ── Lighting: warm daylight filtering through glass ──────────────
      scene.add(new THREE.HemisphereLight(0xdff2b8, 0x16281a, 1.15));
      scene.add(new THREE.AmbientLight(0x35513a, 0.8));
      const sun = new THREE.DirectionalLight(0xfff2cf, 1.9);       // warm sun from far end
      sun.position.set(-20, 70, -180);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9fe8d6, 0.5);
      fill.position.set(30, 25, 40);
      scene.add(fill);

      // ── Image-based lighting — the single biggest realism win ────────
      // A real environment map gives every material proper reflections &
      // specular response, so surfaces read as real materials instead of
      // flat plastic. (RoomEnvironment is a soft neutral studio IBL.)
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      // Soft glow texture (backlight, motes, flower bloom, shafts)
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

      // ── Bright warm-green garden glow at the far end of the hall ─────
      const backGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xeaf6b8, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
      }));
      backGlow.position.set(0, 26, -200);
      backGlow.scale.setScalar(220);
      scene.add(backGlow);

      // Soft light shafts from the far-upper end
      type Shaft = { sp: T3.Sprite; ph: number };
      const shafts: Shaft[] = [];
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, color: 0xe8f4c0, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.06 + Math.random() * 0.06,
        }));
        sp.position.set((Math.random() - 0.5) * 90, 20 + Math.random() * 30, -120 - Math.random() * 60);
        sp.scale.set(18 + Math.random() * 14, 90 + Math.random() * 40, 1);
        scene.add(sp);
        shafts.push({ sp, ph: Math.random() * 6.28 });
      }

      // ── Arched iron-and-glass architecture, repeating down the hall ──
      const HALF_W = 42;          // hall half-width
      const APEX   = 44;          // arch apex height
      // Real brushed metal — high metalness + env reflections (no flat emissive)
      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x2b4234, roughness: 0.32, metalness: 0.9, envMapIntensity: 1.1,
      });
      // Reflective glass — picks up the environment, faint tint, no emissive
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x9ad8b4, roughness: 0.04, metalness: 0.0,
        transparent: true, opacity: 0.12, envMapIntensity: 1.6,
        side: THREE.DoubleSide,
      });
      const archZs = [34, 6, -22, -50, -80, -112, -146, -182];
      const archGeo = new THREE.TorusGeometry(HALF_W, 0.7, 6, 40, Math.PI); // standing half-ring
      const postGeo = new THREE.CylinderGeometry(0.7, 0.7, APEX, 8);
      for (const z of archZs) {
        const arch = new THREE.Mesh(archGeo, ironMat);
        arch.position.set(0, 0, z);   // half-ring apex at +y, ends at y≈0
        scene.add(arch);
        // side posts
        for (const sx of [-HALF_W, HALF_W]) {
          const post = new THREE.Mesh(postGeo, ironMat);
          post.position.set(sx, APEX / 2, z);
          scene.add(post);
        }
        // a faint glass panel filling the arch (subtle)
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, APEX), glassMat);
        panel.position.set(0, APEX / 2, z - 0.3);
        scene.add(panel);
      }
      // Ridge beam + two side rails connecting the arches
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 240), ironMat);
      ridge.position.set(0, APEX - 1, -74);
      scene.add(ridge);
      for (const sx of [-HALF_W, HALF_W]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 240), ironMat);
        rail.position.set(sx, 1, -74);
        scene.add(rail);
      }
      // ── Reflective water floor — a calm conservatory reflecting pool.
      // Same Three.js Water shader that made the ocean look real: it mirrors
      // the arches, plants and the bright far end, with live sun glitter and
      // gentle moving ripples. This is the "ocean realism" inside the lab.
      const waterGeometry = new THREE.PlaneGeometry(160, 320);
      const waterNormals = new THREE.TextureLoader().load("/waternormals.jpg", (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      });
      const sunDir = sun.position.clone().normalize();
      const waterFloor = new Water(waterGeometry, {
        textureWidth: 512, textureHeight: 512, waterNormals,
        sunDirection: sunDir, sunColor: 0xfff0d0, waterColor: 0x0a2a26,
        distortionScale: 1.4,           // calm — a polished reflecting pool
        fog: true,
      });
      waterFloor.rotation.x = -Math.PI / 2;
      waterFloor.position.set(0, 0.2, -74);
      scene.add(waterFloor);

      // ── Plant builders ───────────────────────────────────────────────
      const greens = [0x2f8d5e, 0x3fa776, 0x57c08a, 0x6fce98, 0x248a6a, 0x1f7a52];
      const blooms = [0xc0398f, 0xd1452f, 0xe08a2a, 0x8b3fb0, 0xe0c33a, 0xe85d8a];
      type Swayer = { obj: T3.Object3D; ph: number; amp: number; spd: number };
      const swayers: Swayer[] = [];
      const leafGeo = new THREE.ConeGeometry(0.9, 5.0, 5);
      const bloomGeo = new THREE.SphereGeometry(0.9, 10, 10);

      const makePlant = (x: number, z: number, scale: number, leaves: number, withFlowers: boolean): void => {
        const group = new THREE.Group();
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(1.8, 1.3, 2.6, 12),
          new THREE.MeshStandardMaterial({ color: 0x3a2419, roughness: 0.9 }),  // terracotta-ish
        );
        pot.position.y = 1.3; group.add(pot);
        for (let i = 0; i < leaves; i++) {
          const col = greens[i % greens.length];
          const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({
            color: col, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.6, side: THREE.DoubleSide,
          }));
          const a = (i / leaves) * Math.PI * 2;
          const tilt = 0.5 + Math.random() * 0.5;
          leaf.position.set(Math.cos(a) * 0.6, 3.3, Math.sin(a) * 0.6);
          leaf.rotation.set(Math.cos(a) * tilt - 0.15, -a, Math.sin(a) * tilt + 0.15);
          leaf.scale.set(1, 0.9 + Math.random() * 0.5, 0.35);
          group.add(leaf);
        }
        if (withFlowers) {
          const n = 3 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) {
            const col = blooms[Math.floor(Math.random() * blooms.length)];
            const fl = new THREE.Mesh(bloomGeo, new THREE.MeshStandardMaterial({
              color: col, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.8,
              emissive: col, emissiveIntensity: 0.18,   // subtle pop, not plastic glow
            }));
            const a = Math.random() * Math.PI * 2;
            fl.position.set(Math.cos(a) * (1 + Math.random()), 5 + Math.random() * 1.5, Math.sin(a) * (1 + Math.random()));
            fl.scale.setScalar(0.7 + Math.random() * 0.6);
            group.add(fl);
          }
        }
        group.position.set(x, 0, z);
        group.scale.setScalar(scale);
        scene.add(group);
        swayers.push({ obj: group, ph: Math.random() * 6.28, amp: 0.025 + Math.random() * 0.03, spd: 0.5 + Math.random() * 0.4 });
      };

      const makeConifer = (x: number, z: number, scale: number): void => {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.7, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 }),
        );
        trunk.position.y = 2; group.add(trunk);
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const r = 4.5 - i * 0.9;
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(r, 5, 12),
            new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.5 }),
          );
          cone.position.y = 5 + i * 3.2;
          group.add(cone);
        }
        group.position.set(x, 0, z);
        group.scale.setScalar(scale);
        scene.add(group);
        swayers.push({ obj: group, ph: Math.random() * 6.28, amp: 0.012 + Math.random() * 0.015, spd: 0.4 + Math.random() * 0.3 });
      };

      const makeHanging = (x: number, z: number, scale: number): void => {
        const group = new THREE.Group();
        const basket = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 1.6, 2, 10),
          new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 }),
        );
        group.add(basket);
        for (let i = 0; i < 10; i++) {
          const col = greens[i % greens.length];
          const v = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({
            color: col, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.6, side: THREE.DoubleSide,
          }));
          const a = (i / 10) * Math.PI * 2;
          v.position.set(Math.cos(a) * 1.4, -2.5 - Math.random() * 2.5, Math.sin(a) * 1.4);
          v.rotation.set(Math.PI + (Math.random() - 0.5) * 0.4, a, 0);
          v.scale.set(0.8, 1.5 + Math.random(), 0.3);
          group.add(v);
        }
        group.position.set(x, APEX - 6, z);
        group.scale.setScalar(scale);
        scene.add(group);
        swayers.push({ obj: group, ph: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.04, spd: 0.6 + Math.random() * 0.4 });
      };

      // Foreground flower beds (close to camera, colourful — like the reference)
      const makeBed = (x: number, z: number): void => {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(16, 3, 8),
          new THREE.MeshStandardMaterial({ color: 0x241712, roughness: 0.9 }),
        );
        box.position.set(x, 1.5, z);
        scene.add(box);
        for (let i = 0; i < 10; i++) {
          makePlant(x - 6 + Math.random() * 12, z - 2 + Math.random() * 4, 0.55 + Math.random() * 0.35, 8, true);
        }
      };

      // Lay out the conservatory planting
      makeBed(-4, 26);  makeBed(16, 24);                 // foreground flower beds
      makePlant(-30, 16, 1.6, 11, true);
      makePlant(30, 14, 1.7, 11, true);
      makeConifer(-36, -8, 1.8);  makeConifer(38, -12, 1.9);
      makePlant(-26, -34, 2.2, 12, true);
      makePlant(28, -38, 2.3, 12, true);
      makeConifer(-34, -64, 2.4); makeConifer(36, -70, 2.5);
      makePlant(-22, -96, 2.8, 13, true);
      makePlant(24, -100, 2.9, 13, false);
      makeConifer(0, -130, 3.2);
      makePlant(-18, -150, 3.0, 13, true);
      makePlant(20, -156, 3.1, 13, true);
      for (let i = 0; i < 8; i++) makeHanging(-30 + (i % 4) * 20, archZs[i % archZs.length], 1.2 + Math.random() * 0.6);

      // ── A few researchers at a clean bench (mid hall) ────────────────
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(60, 3, 6),
        new THREE.MeshStandardMaterial({ color: 0x1c3a30, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.0 }),
      );
      bench.position.set(0, 2, -44);
      scene.add(bench);
      type Person = { g: T3.Group; ph: number; sway: number; arm: T3.Mesh; armPh: number };
      const people: Person[] = [];
      const silMat = new THREE.MeshStandardMaterial({ color: 0x14241a, roughness: 0.9, emissive: 0x0c1c14, emissiveIntensity: 0.2 });
      for (const px of [-16, 0, 16]) {
        const g = new THREE.Group();
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3.2, 6, 10), silMat); torso.position.y = 3.8; g.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 14), silMat); head.position.y = 7.0; g.add(head);
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.4, 4, 8), silMat); arm.position.set(1.2, 4.2, 0.4); arm.rotation.z = -0.7; g.add(arm);
        g.position.set(px, 0, -50);
        scene.add(g);
        people.push({ g, ph: Math.random() * 6.28, sway: 0.5 + Math.random() * 0.4, arm, armPh: Math.random() * 6.28 });
      }

      // ── Drifting pollen / motes ──────────────────────────────────────
      const moteCount = 240;
      const mpos = new Float32Array(moteCount * 3);
      const mbase = new Float32Array(moteCount * 3);
      for (let i = 0; i < moteCount; i++) {
        const x = (Math.random() - 0.5) * 110, y = Math.random() * 50, z = 30 - Math.random() * 220;
        mpos[i*3]=mbase[i*3]=x; mpos[i*3+1]=mbase[i*3+1]=y; mpos[i*3+2]=mbase[i*3+2]=z;
      }
      const moteGeo = new THREE.BufferGeometry();
      moteGeo.setAttribute("position", new THREE.BufferAttribute(mpos, 3));
      const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
        size: 0.5, map: glowTex, color: 0xf0f4c0, transparent: true,
        opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      scene.add(motes);

      // ── Bloom ────────────────────────────────────────────────────────
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.3,
      ));

      // ── Interaction: mouse parallax + scroll fly-through ─────────────
      let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
      const onMove = (e: PointerEvent) => {
        targetYaw   = (e.clientX / window.innerWidth  - 0.5) * 0.14;
        targetPitch = (e.clientY / window.innerHeight - 0.5) * 0.07;
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
      const sstep = THREE.MathUtils.smoothstep;
      let raf = 0;

      const animate = () => {
        const t = clock.getElapsedTime();

        // Animate the reflective water floor (live ripples + moving sun glitter)
        (waterFloor.material as T3.ShaderMaterial).uniforms["time"].value += 1 / 60;

        for (const s of shafts) s.sp.material.opacity = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.3 + s.ph));
        for (const s of swayers) {
          s.obj.rotation.z = Math.sin(t * s.spd + s.ph) * s.amp;
          s.obj.rotation.x = Math.cos(t * s.spd * 0.7 + s.ph) * s.amp * 0.5;
        }
        for (const p of people) {
          p.g.rotation.z = Math.sin(t * p.sway + p.ph) * 0.04;
          p.g.position.y = Math.sin(t * p.sway * 0.8 + p.ph) * 0.2;
          p.arm.rotation.z = -0.7 + Math.sin(t * 1.6 + p.armPh) * 0.25;
        }
        const arr = moteGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          arr[i*3]   = mbase[i*3]   + Math.sin(t * 0.1 + i) * 1.4;
          arr[i*3+1] = mbase[i*3+1] + ((t * 1.0 + i * 0.3) % 50);
          arr[i*3+2] = mbase[i*3+2] + Math.cos(t * 0.08 + i) * 1.2;
        }
        moteGeo.attributes.position.needsUpdate = true;

        yaw    += (targetYaw    - yaw)    * 0.04;
        pitch  += (targetPitch  - pitch)  * 0.04;
        scroll += (scrollTarget - scroll) * 0.06;

        // Fly down the hall toward the bright end, rising near the finish
        camera.position.z = 46 - scroll * 200;
        camera.position.x = Math.sin(yaw) * 9 + (sstep(scroll, 0.25, 0.7) - 0.5) * 18;
        camera.position.y = 8 + sstep(scroll, 0.55, 1.0) * 18 + pitch * 14 + Math.sin(t * 0.14) * 0.8;
        camera.lookAt(camera.position.x * 0.25, 9 + sstep(scroll, 0.6, 1.0) * 8, camera.position.z - 50);

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
        glowTex.dispose(); waterNormals.dispose(); waterGeometry.dispose();
        envTex.dispose(); pmrem.dispose();
        leafGeo.dispose(); bloomGeo.dispose(); archGeo.dispose(); postGeo.dispose();
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
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(90deg, rgba(6,16,11,0.72) 0%, rgba(6,16,11,0.32) 42%, transparent 72%)," +
            "linear-gradient(180deg, rgba(6,16,11,0.28) 0%, transparent 30%, transparent 64%, rgba(6,16,11,0.42) 100%)",
        }}
      />
    </>
  );
}
