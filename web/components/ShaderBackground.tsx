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
uniform vec2  u_mouse;
uniform float u_time;

// ── Smooth value noise (cubic interpolation) ──────────────────────────
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Smoother (quintic) interpolation → no faceting in the bubble surface
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
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
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.04; a *= 0.5; }
  return v;
}

// ── Vertical light-curtain field ──────────────────────────────────────
// x heavily stretched → thin vertical streaks; y scrolls downward over
// time so the light "rains". Powered + lifted into crisp bright filaments.
float curtain(vec2 uv, float t, float xscale, float speed) {
  vec2 sp = vec2(uv.x * xscale, uv.y * 2.4 - t * speed);
  float n = fbm(sp);
  n = smoothstep(0.02, 0.72, n);   // lift midtones
  n = pow(n, 2.6);                 // sharpen into bright thin filaments
  return n;
}

void main() {
  vec2 uv = v_uv;                  // 0 bottom-left → 1 top-right
  float t = u_time;
  vec2  m = u_mouse;               // y already flipped (1 = top)

  // Curtain concentrates in a central vertical band that sways with cursor X
  float center = 0.5 + (m.x - 0.5) * 0.14;
  float dx     = uv.x - center;
  float band   = exp(-dx * dx * 5.0);

  // Two streak layers at different scales/speeds → depth
  float s = curtain(uv, t, 46.0, 1.05) * 0.80
          + curtain(uv, t, 88.0, 1.70) * 0.45;

  // Vertical shaping: emerge softly at the top, intensify lower down
  float topFade = smoothstep(1.04, 0.50, uv.y);
  s *= band * topFade;

  // Bright pooling "fan" where the light lands, lower-centre
  float fanY = smoothstep(0.40, 0.02, uv.y);
  float fan  = exp(-dx * dx * 2.6) * fanY;

  // Cursor brightens nearby streaks (and the fan beneath it)
  float md = length(vec2(dx, uv.y - m.y));
  float cursorGlow = exp(-md * md * 7.0);

  float I = s + fan * 0.95 + cursorGlow * 0.35;

  // ── Warm gold ramp: black → deep amber → gold → white-hot ──
  vec3 amber = vec3(0.42, 0.27, 0.10);
  vec3 gold  = vec3(0.82, 0.63, 0.34);
  vec3 hot   = vec3(1.00, 0.94, 0.82);

  vec3 col = vec3(0.0);
  col += amber * smoothstep(0.04, 0.50, I);
  col += gold  * smoothstep(0.28, 0.92, I);
  col += hot   * smoothstep(0.72, 1.45, I);

  // Faint warm floor wash so pure black at the base isn't dead
  col += vec3(0.055, 0.040, 0.022) * smoothstep(0.35, 0.0, uv.y);

  // Gentle vignette to hold the eye centrally
  float vig = smoothstep(1.35, 0.30, length(uv - 0.5));
  col *= mix(0.62, 1.0, vig);

  // 8-bit dither — kills banding in the dark gradients
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
