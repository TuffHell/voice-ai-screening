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

// ── Wave height field for the side-view ocean ─────────────────────────
// 'x' is horizontal position, 'd' is distance-from-camera (0 = close, 1 = far).
// Closer waves are larger and more detailed; distant waves smaller and softer
// (atmospheric perspective). Five superimposed waves with cross-coupled phase
// so they don't repeat obviously.
float waveHeight(float x, float d, float t) {
  // Distance-based amplitude: bigger amplitude near the camera
  float amp = mix(0.085, 0.012, d);
  // Distance-based frequency: tighter (smaller-looking) waves near horizon
  float freq = mix(8.0, 32.0, d);

  // Slow large swell
  float h  = sin(x * (freq * 0.45) + t * 0.55 + sin(x * 1.7) * 0.6) * 0.55;
  // Secondary cross-swell
  h += sin(x * (freq * 0.9) - t * 0.85 + cos(x * 2.3 + t * 0.3) * 0.4) * 0.32;
  // Mid-frequency chop
  h += sin(x * (freq * 1.8) + t * 1.3 + sin(x * 5.1 - t * 0.6) * 0.3) * 0.18;
  // Fine ripples
  h += sin(x * (freq * 3.6) - t * 1.9) * 0.08;
  // Tiny spray-level detail
  h += sin(x * (freq * 7.5) + t * 3.2) * 0.04;

  return h * amp;
}

void main() {
  vec2 uv = v_uv;

  // Horizon position — slightly above middle so the ocean dominates
  // (mouse Y nudges it ±0.04 for a subtle parallax)
  float horizon = 0.46 + (u_mouse.y - 0.5) * 0.04;

  vec3 col;

  // ─────────────────────────── SKY ────────────────────────────────────
  if (uv.y > horizon) {
    // t: 0 at horizon, 1 at top of viewport
    float t = clamp((uv.y - horizon) / max(0.0001, 1.0 - horizon), 0.0, 1.0);

    // Cool dusk → deep dusk gradient, kept in the clinical palette
    // (no bright peach — the page text is white-on-dark and a warm sky
    //  would clash with the rest of the design).
    vec3 skyHorizon = vec3(0.295, 0.395, 0.530);   // dusty blue
    vec3 skyMid     = vec3(0.140, 0.220, 0.380);   // navy-violet
    vec3 skyTop     = vec3(0.055, 0.105, 0.220);   // deep dusk
    col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.45, t));
    col = mix(col, skyTop, smoothstep(0.45, 1.0, t));

    // Soft warm sun-glow band right at the horizon — mouse X moves it
    float sunX  = 0.5 + (u_mouse.x - 0.5) * 0.4;
    float sunDX = abs(uv.x - sunX);
    float sunGlow = smoothstep(0.45, 0.0, sunDX) * smoothstep(0.20, 0.0, t);
    col += vec3(1.00, 0.78, 0.55) * sunGlow * 0.28;

    // Distant high-altitude haze band along horizon
    float horizonBand = smoothstep(0.07, 0.0, t);
    col += vec3(0.85, 0.78, 0.78) * horizonBand * 0.08;
  }
  // ─────────────────────────── OCEAN ──────────────────────────────────
  else {
    // d: 0 close to camera (bottom of screen), 1 at horizon (top of ocean)
    float d = 1.0 - clamp((horizon - uv.y) / horizon, 0.0, 1.0);

    // Perspective compression on X so waves stretch toward the horizon
    float persp = 1.0 + d * 6.0;
    float x = (uv.x - 0.5) * persp;

    // Mouse-driven local pull on the X coordinate
    float mDx = (uv.x - u_mouse.x) * persp;
    float mDy = (uv.y - u_mouse.y);
    float mD  = length(vec2(mDx * 0.6, mDy));
    float warpA = smoothstep(0.35, 0.0, mD) * 0.06;
    x += (u_mouse.x - 0.5) * warpA * persp;

    // Sample the wave field
    float h    = waveHeight(x, d, u_time);
    // Local gradient → approximate slope for shading
    float hL   = waveHeight(x - 0.005, d, u_time);
    float hR   = waveHeight(x + 0.005, d, u_time);
    float slope = (hR - hL) / 0.01;

    // Base ocean colour: dark teal-navy → lighter teal at the surface
    vec3 oceanDeep = vec3(0.030, 0.075, 0.135);
    vec3 oceanMid  = vec3(0.060, 0.205, 0.305);
    vec3 oceanLit  = vec3(0.150, 0.430, 0.555);
    col = mix(oceanDeep, oceanMid, smoothstep(0.0, 0.7, d));
    // Brighter where the wave crests are (large h)
    col = mix(col, oceanLit, smoothstep(0.0, 0.05, h) * 0.6);

    // Foam: where the wave slope is steep AND height is near a crest.
    // Closer to the camera = more foam visible.
    float crestNess = smoothstep(0.025, 0.055, h);
    float steep     = smoothstep(0.25, 1.4, abs(slope));
    float foam      = crestNess * steep;
    foam += smoothstep(0.045, 0.07, h) * 0.6;
    foam *= mix(0.4, 1.4, d * d);   // perspective: more foam visible far away
    foam  = clamp(foam, 0.0, 1.0);

    // Slight warm sun-kiss on the foam (sunset bouncing off white tops)
    vec3 foamColor = vec3(0.94, 0.96, 0.98) + vec3(0.04, 0.01, -0.02);
    col = mix(col, foamColor, foam);

    // Atmospheric perspective — far waves take on horizon colour
    vec3 horizonTint = vec3(0.295, 0.395, 0.530);
    col = mix(col, horizonTint, smoothstep(0.65, 1.0, d) * 0.55);

    // Subtle warm reflection band of the sun on water close to camera
    float sunStrip = smoothstep(0.0, 0.5, h) * smoothstep(0.5, 0.0, d);
    col += vec3(0.85, 0.55, 0.40) * sunStrip * 0.08;
  }

  // Soft cursor glow regardless of sky/ocean
  float mDist = length(vec2((uv.x - u_mouse.x) * (u_res.x / u_res.y), uv.y - u_mouse.y));
  col += vec3(0.50, 0.70, 1.00) * smoothstep(0.15, 0.0, mDist) * 0.08;

  // Gentle vignette
  float vig = smoothstep(1.20, 0.35, length(uv - 0.5));
  col *= mix(0.70, 1.0, vig);

  // 8-bit dither — kills banding in the smooth sky gradient
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
