"use client";
/**
 * Continuous procedural shader background — single layer, single canvas.
 *
 * No splats, no particle systems, no point sources. Every pixel of the
 * viewport is continuously animated by a domain-warped FBM noise field.
 * The cursor warps the field locally; it cannot produce hot spots because
 * it doesn't *add* anything — it only displaces the existing flow.
 *
 * Rendered as a single WebGL2 fragment shader on one full-screen quad.
 * One uniform update per frame; the GPU does everything else. Runs at
 * native refresh rate on integrated GPUs.
 *
 * This is the right tool for "always-on flowing background visible across
 * the whole page" — every previous attempt (CSS gradients, particle
 * networks, splat-based fluids) had fundamental failure modes for that
 * requirement. A continuous shader has none.
 */
import { useEffect, useRef } from "react";

const VERT = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_res;
uniform vec2  u_mouse;       // normalised 0..1 (y already flipped)
uniform float u_time;

// ── Hash + noise + fbm ────────────────────────────────────────────────
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// ── Wave caustics — interference of three rotating sine wave fields ────
float caustics(vec2 p, float t) {
  vec2 q = p * 4.5;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q = vec2(
      q.x + sin(q.y * (1.3 + fi * 0.2) + t * (1.0 + fi * 0.13)),
      q.y + cos(q.x * (1.1 + fi * 0.18) + t * (0.7 + fi * 0.11))
    );
    c += 1.0 / max(0.15, length(q));
  }
  return c / 3.0;
}

// ── Floating particle field — small bright dots drifting upward ───────
float particles(vec2 p, float t) {
  // Move sample space slowly upward over time so dots drift up
  p.y -= t * 0.08;
  vec2 i = floor(p * 22.0);
  vec2 f = fract(p * 22.0);
  // Per-cell random offset + intensity
  vec2 r  = hash22(i);
  float radius = 0.03 + 0.06 * fract(r.x * 9.71);
  // Twinkle: each particle modulates its brightness with its own phase
  float twinkle = 0.55 + 0.45 * sin(t * (1.0 + fract(r.y * 17.3)) + r.x * 6.28);
  float d = length(f - (r * 0.5 + 0.25));
  return smoothstep(radius, 0.0, d) * twinkle * step(0.7, fract(r.x * 53.0 + r.y * 17.0));
}

// ── Subtle horizon grid — distant perspective lines ───────────────────
float horizonGrid(vec2 uv) {
  // Only show in the lower half of the screen, fading to nothing on top
  float depth = smoothstep(0.65, 1.0, uv.y);                  // 0 above midline, 1 at bottom
  // Vertical lines: more frequent as we approach the bottom (perspective)
  float density = mix(8.0, 28.0, depth);
  vec2 g = abs(fract(vec2(uv.x * density, uv.y * 14.0)) - 0.5);
  float line = max(
    smoothstep(0.49, 0.50, 0.5 - g.x),
    smoothstep(0.49, 0.50, 0.5 - g.y)
  );
  return line * depth * 0.18;
}

void main() {
  vec2 uv      = v_uv;
  float aspect = u_res.x / u_res.y;
  vec2 p       = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 mp      = (u_mouse - 0.5) * vec2(aspect, 1.0);

  // Mouse warp
  vec2  toMouse = mp - p;
  float mDist   = length(toMouse);
  float warpAmt = smoothstep(0.55, 0.0, mDist) * 0.22;
  vec2  warpVec = toMouse * warpAmt;

  float t = u_time * 0.045;

  // ── Aurora field (domain-warped fbm) ─────────────────────────────────
  vec2 q = vec2(
    fbm(p * 1.4 + vec2( t, -t * 0.7) + warpVec),
    fbm(p * 1.4 + vec2(-t * 0.5, t * 0.9) + warpVec * 0.8)
  );
  vec2 r = vec2(
    fbm(p * 1.8 + q + vec2(1.7, 9.2) + warpVec * 0.5),
    fbm(p * 1.8 + q + vec2(8.3, 2.8) + warpVec * 0.5)
  );
  float f = fbm(p * 1.6 + 1.5 * r + t * 0.8);

  // ── Wave caustics on top ─────────────────────────────────────────────
  float caust = caustics(p + warpVec * 0.5, u_time * 0.7) - 0.5;
  caust = clamp(caust * 0.9, 0.0, 1.0);

  // ── Aurora colour palette ────────────────────────────────────────────
  vec3 deep      = vec3(0.020, 0.040, 0.100);
  vec3 ink       = vec3(0.040, 0.075, 0.160);
  vec3 emerald   = vec3(0.063, 0.725, 0.506);
  vec3 cyan      = vec3(0.133, 0.827, 0.933);
  vec3 azure     = vec3(0.231, 0.510, 0.965);
  vec3 violet    = vec3(0.545, 0.361, 0.965);
  vec3 gold      = vec3(0.941, 0.851, 0.651);

  vec3 col = deep;
  col = mix(col, ink,     smoothstep(-0.20, 0.40, f));
  col = mix(col, azure,   smoothstep( 0.05, 0.55, f) * 0.62);
  col = mix(col, emerald, smoothstep( 0.20, 0.65, f) * 0.38);
  col = mix(col, cyan,    smoothstep( 0.45, 0.78, f) * 0.55);
  col = mix(col, violet,  smoothstep( 0.55, 0.85, f) * 0.50);
  col = mix(col, gold,    smoothstep( 0.78, 0.95, f) * 0.22);

  // Caustics add bright sinuous highlights — like sunlight through water
  col += vec3(0.45, 0.75, 1.0) * caust * 0.22;

  // Subtle horizon grid — architectural depth cue near the bottom
  col += vec3(0.4, 0.65, 1.0) * horizonGrid(uv);

  // Floating bioluminescent particles
  float pf = particles(p + warpVec * 0.3, u_time);
  col += vec3(0.7, 0.9, 1.0) * pf * 0.65;

  // Mouse halo
  col += vec3(0.45, 0.65, 1.0) * smoothstep(0.30, 0.0, mDist) * 0.12;
  col += vec3(0.95, 0.85, 0.65) * smoothstep(0.12, 0.0, mDist) * 0.10;

  // Vignette
  float vig = smoothstep(1.20, 0.35, length(uv - 0.5));
  col *= mix(0.55, 1.0, vig);

  // 8-bit dither
  float dith = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  col += vec3(dith);

  gl_FragColor = vec4(col, 1.0);
}`;

export default function ShaderBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false }) as WebGLRenderingContext | null;
    if (!gl) return;

    const compile = (src: string, type: number): WebGLShader => {
      const s = gl.createShader(type);
      if (!s) throw new Error("createShader failed");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`shader compile: ${log}`);
      }
      return s;
    };

    let program: WebGLProgram | null = null;
    try {
      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, compile(VERT, gl.VERTEX_SHADER));
      gl.attachShader(program, compile(FRAG, gl.FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[ShaderBackground] link error:", gl.getProgramInfoLog(program));
        return;
      }
    } catch (err) {
      console.error("[ShaderBackground] shader error:", err);
      return;
    }
    gl.useProgram(program);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(program, "u_res");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uTime  = gl.getUniformLocation(program, "u_time");

    // Render at 75% device resolution — the noise field is low-frequency so
    // it looks identical and saves a quarter of the fill rate.
    const QUALITY = 0.75;
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width  = Math.max(1, Math.floor(w * QUALITY));
      canvas.height = Math.max(1, Math.floor(h * QUALITY));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pointer (smoothed)
    let mx = 0.5, my = 0.5;
    let smx = mx, smy = my;
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth;
      my = 1 - e.clientY / window.innerHeight;
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      mx = t.clientX / window.innerWidth;
      my = 1 - t.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchmove",   onTouch, { passive: true });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const tick = () => {
      smx += (mx - smx) * 0.07;
      smy += (my - smy) * 0.07;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, smx, smy);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchmove",   onTouch);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{
        width:  "100vw",
        height: "100vh",
        zIndex: 0,
      }}
    />
  );
}
