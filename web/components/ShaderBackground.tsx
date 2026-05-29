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

// ── Arched conservatory roof structure (silhouette mullions) ──────────
// Nested arches converging on an apex high above → reads as a glasshouse
// ceiling receding into depth. Returns 0..1 darkening for the iron ribs.
float archMullions(vec2 uv, float aspect) {
  vec2 a = vec2((uv.x - 0.5) * aspect, uv.y - 1.18);  // apex high above frame
  float r = length(a);
  // concentric arch ribs, denser toward the apex (perspective)
  float ribs = abs(sin(r * 13.0));
  ribs = smoothstep(0.92, 1.0, ribs);
  // radial glazing bars
  float ang = atan(a.x, -a.y);
  float bars = abs(sin(ang * 9.0));
  bars = smoothstep(0.96, 1.0, bars);
  float structure = max(ribs, bars);
  // only in the upper half, fading down
  return structure * smoothstep(0.35, 0.95, uv.y);
}

void main() {
  vec2 uv = v_uv;                  // 0 bottom-left → 1 top-right
  float t = u_time;
  vec2  m = u_mouse;               // y already flipped (1 = top)
  float aspect = u_res.x / u_res.y;

  // ── Base: a glowing glasshouse — deep green floor → luminous green light
  vec3 deep   = vec3(0.030, 0.085, 0.060);
  vec3 midG   = vec3(0.075, 0.215, 0.140);
  vec3 sunlit = vec3(0.620, 0.700, 0.360);   // warm sunlit green at the glass
  vec3 col = mix(deep, midG, smoothstep(0.0, 0.55, uv.y));
  col = mix(col, sunlit, smoothstep(0.45, 1.05, uv.y) * 0.85);

  // ── Sun position high in the glass, drifts gently + with cursor ──────
  vec2 lightPos = vec2(0.62 + (m.x - 0.5) * 0.22 + sin(t * 0.05) * 0.04,
                       1.02 + sin(t * 0.07) * 0.02);

  // ── Volumetric god rays streaming down from the sun ──────────────────
  // March from the pixel toward the light, accumulating brightness with a
  // shaft pattern that shimmers over time → the signature serene sunbeams.
  vec2 delta = (uv - lightPos) / 26.0;
  vec2 s = uv;
  float illum = 1.0;
  float rays = 0.0;
  for (int i = 0; i < 26; i++) {
    s -= delta;
    float ang = atan(s.x - lightPos.x, -(s.y - lightPos.y));
    // angular shafts, animated; modulated by soft noise for organic flicker
    float shaft = 0.55 + 0.45 * sin(ang * 26.0 + sin(t * 0.5) * 2.0);
    shaft *= 0.7 + 0.3 * fbm(s * 6.0 + vec2(0.0, t * 0.3));
    float near = smoothstep(0.75, 0.0, length(s - lightPos));
    rays += shaft * near * illum;
    illum *= 0.95;
  }
  rays /= 26.0;
  col += vec3(0.95, 0.97, 0.62) * rays * 1.15;

  // Soft bright bloom right around the sun
  col += vec3(1.0, 0.98, 0.78) * smoothstep(0.4, 0.0, length(uv - lightPos)) * 0.5;

  // ── Conservatory glass roof structure (silhouette ribs) ──────────────
  float arches = archMullions(uv, aspect);
  col = mix(col, vec3(0.05, 0.12, 0.09), arches * 0.55);   // dark iron ribs

  // ── Floating pollen / dust motes drifting up through the light ───────
  vec2 dp = vec2(uv.x * aspect * 26.0, uv.y * 26.0 - t * 0.6);
  vec2 cell = floor(dp);
  vec2 f = fract(dp) - 0.5;
  vec2 rnd = hash22(cell);
  float mote = smoothstep(0.12, 0.0, length(f - rnd * 0.3))
             * step(0.82, fract(rnd.x * 41.0))
             * (0.5 + 0.5 * sin(t * 1.5 + rnd.y * 6.28));
  col += vec3(0.95, 1.0, 0.8) * mote * (0.4 + rays * 1.5);

  // ── Foliage silhouettes framing the bottom + sides (gentle sway) ─────
  vec2 fp = vec2((uv.x - 0.5) * aspect, uv.y);
  float sway = sin(t * 0.4 + uv.x * 6.0) * 0.015;
  float foliage = fbm(vec2(fp.x * 3.2 + sway, fp.y * 3.2 - t * 0.03));
  // dark leafy mass rising from the bottom edge + lower corners
  float bottom = smoothstep(0.34, 0.0, uv.y - foliage * 0.16);
  float corners = smoothstep(0.42, 0.0, abs(uv.x - 0.5) * aspect - 0.55) *
                  smoothstep(0.55, 0.0, uv.y) * smoothstep(0.45, 0.75, foliage);
  float leaf = clamp(bottom + corners, 0.0, 1.0);
  col = mix(col, vec3(0.020, 0.070, 0.045), leaf);
  // rim light on the foliage where the sun catches it
  col += vec3(0.5, 0.65, 0.3) * leaf * rays * 0.6;

  // ── Atmospheric haze toward the bright top (depth) ───────────────────
  col = mix(col, vec3(0.45, 0.55, 0.32), smoothstep(0.8, 1.05, uv.y) * 0.18);

  // Gentle vignette
  float vig = smoothstep(1.4, 0.35, length(uv - vec2(0.5, 0.55)));
  col *= mix(0.7, 1.0, vig);

  // 8-bit dither — kills banding
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
