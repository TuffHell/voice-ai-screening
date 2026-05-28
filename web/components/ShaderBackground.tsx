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

// ── Ocean height field — superposition of warped sine waves ───────────
// Five wave layers at different angles, frequencies and speeds, sampled
// in a slowly-warped coordinate space so the wave shapes are organic
// instead of mathematically perfect. Cheap on the GPU: ~16 ALU ops.
float oceanHeight(vec2 p, float t) {
  // Warp the sampling space → curving, non-rectilinear wave fronts
  vec2 q = p;
  q.x += 0.18 * sin(p.y * 1.4 + t * 0.40);
  q.y += 0.14 * cos(p.x * 1.1 + t * 0.35);

  float h = 0.0;
  h += sin(dot(q, vec2( 0.60,  0.80)) *  2.0 + t * 1.20) * 0.50;
  h += sin(dot(q, vec2(-0.70,  0.60)) *  3.5 + t * 1.65) * 0.30;
  h += sin(dot(q, vec2( 0.40, -0.90)) *  5.5 + t * 2.30) * 0.18;
  h += sin(dot(q, vec2( 0.80,  0.30)) *  9.0 + t * 3.00) * 0.10;
  h += sin(dot(q, vec2(-0.30,  1.10)) * 14.0 + t * 4.50) * 0.05;
  return h;
}

void main() {
  vec2 uv      = v_uv;
  float aspect = u_res.x / u_res.y;
  vec2 p       = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 mp      = (u_mouse - 0.5) * vec2(aspect, 1.0);

  // Mouse displaces the wave field locally — a soft pull
  vec2  toMouse = mp - p;
  float mDist   = length(toMouse);
  vec2  warp    = toMouse * smoothstep(0.55, 0.0, mDist) * 0.16;

  // Ocean height (-1..1 ish)
  float h = oceanHeight(p + warp, u_time * 0.28);

  // Foam: only where the wave crest is sharpest — narrow band near the top
  // edge of the height range. A windowed smoothstep keeps it crisp.
  float foam = smoothstep(0.55, 0.82, h) * smoothstep(0.95, 0.82, h);

  // Caustic-like sub-surface highlight following the wave gradient — gives
  // the feeling of light dancing through clearer water under the surface.
  float caust = smoothstep(0.20, 0.55, h) * (0.4 + 0.6 * sin(h * 14.0 + u_time * 0.8));
  caust = max(caust, 0.0);

  // Ocean palette (deep, navy, teal, surface, foam white)
  vec3 deep   = vec3(0.010, 0.040, 0.100);
  vec3 navy   = vec3(0.030, 0.105, 0.230);
  vec3 teal   = vec3(0.080, 0.345, 0.520);
  vec3 surf   = vec3(0.265, 0.620, 0.855);
  vec3 foamC  = vec3(0.945, 0.975, 1.000);

  vec3 col = deep;
  col = mix(col, navy, smoothstep(-0.60, -0.05, h));
  col = mix(col, teal, smoothstep(-0.20,  0.30, h));
  col = mix(col, surf, smoothstep( 0.15,  0.60, h));
  col = mix(col, foamC, foam);

  // Sub-surface caustic highlights — subtle warm-blue accent
  col += vec3(0.30, 0.55, 0.85) * caust * 0.18;

  // Mouse halo — gentle warm-light kiss where the pointer is
  col += vec3(0.40, 0.65, 0.95) * smoothstep(0.28, 0.0, mDist) * 0.14;
  col += vec3(0.95, 0.90, 0.75) * smoothstep(0.08, 0.0, mDist) * 0.08;

  // Vignette
  float vig = smoothstep(1.20, 0.35, length(uv - 0.5));
  col *= mix(0.55, 1.0, vig);

  // 8-bit dither to kill banding on dark gradients
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
