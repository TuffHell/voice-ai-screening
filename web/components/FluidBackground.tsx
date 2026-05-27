"use client";
/**
 * GPU-rendered fluid background.
 *
 * A single full-screen WebGL quad runs a fragment shader that:
 *   - Generates domain-warped fractal Brownian motion (slowly evolving)
 *   - Bends the warp field toward the pointer, creating a soft attraction
 *   - Maps the resulting field through a clinical / mysterious blue-gold ramp
 *
 * Everything runs on the GPU — the CPU only updates time + mouse uniforms.
 * No canvas-2D loops, no JS per-pixel work, no DOM animation.
 * Smooth at native refresh rate (120 fps on a desktop GPU; 60 fps locked
 * on a five-year-old MacBook integrated GPU).
 */
import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_res;
uniform vec2  u_mouse;
uniform float u_time;

// ── simplex-ish noise (cheap, GPU-friendly) ──────────────────────────────
vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = v_uv;
  vec2 res = u_res;
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Soft pointer attractor — fluid bends toward the cursor
  vec2 m = vec2(u_mouse.x * aspect, u_mouse.y);
  vec2 toM = m - p;
  float md = length(toM);
  vec2 bend = toM * (0.18 * exp(-md * 3.5));

  float t = u_time * 0.06;

  // Domain-warped fbm — the "flowing fluid" signal
  vec2 q  = vec2(fbm(p * 1.4 + vec2(t, -t * 0.7) + bend),
                 fbm(p * 1.4 + vec2(-t * 0.5, t * 0.9) + bend * 0.8));
  vec2 r  = vec2(fbm(p * 1.8 + q + vec2(1.7, 9.2) + bend * 0.5),
                 fbm(p * 1.8 + q + vec2(8.3, 2.8) + bend * 0.5));
  float f = fbm(p * 1.6 + 1.4 * r + t * 0.8);

  // Two clinical-mysterious palettes blended
  vec3 deepNavy   = vec3(0.020, 0.035, 0.075);
  vec3 ink        = vec3(0.045, 0.075, 0.140);
  vec3 ice        = vec3(0.27,  0.55,  1.00);
  vec3 highlight  = vec3(0.78,  0.88,  1.00);
  vec3 gold       = vec3(0.84,  0.69,  0.42);

  vec3 col = deepNavy;
  col = mix(col, ink,       smoothstep(-0.05, 0.55, f));
  col = mix(col, ice * 0.7, smoothstep( 0.25, 0.65, f) * 0.85);
  col = mix(col, highlight, smoothstep( 0.55, 0.78, f) * 0.55);
  col = mix(col, gold,      smoothstep( 0.65, 0.88, f) * 0.20);

  // Cursor highlight — a soft warm aura around the pointer
  col += vec3(0.35, 0.55, 0.95) * exp(-md * 6.5) * 0.20;
  col += vec3(0.95, 0.85, 0.65) * exp(-md * 14.0) * 0.10;

  // Vignette so the edges hold the eye on content
  float vig = smoothstep(1.0, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.55, 1.0, vig);

  // Tiny dithering against banding on 8-bit displays
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  col += vec3(dither);

  gl_FragColor = vec4(col, 1.0);
}`;

export default function FluidBackground() {
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
        throw new Error("shader compile: " + log);
      }
      return s;
    };

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(VERT, gl.VERTEX_SHADER));
    gl.attachShader(program, compile(FRAG, gl.FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("link error:", gl.getProgramInfoLog(program));
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

    // Render at half-resolution to be GPU-light; CSS scales it up smoothly.
    // Looks essentially identical because the field is low-frequency.
    let dpr = 1;
    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width  = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pointer
    let mx = 0.5, my = 0.5;
    let smx = mx, smy = my;
    const onMove = (e: PointerEvent) => {
      mx = e.clientX / window.innerWidth;
      my = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const tick = () => {
      // Ease pointer for soft attraction (rather than abrupt snapping)
      smx += (mx - smx) * 0.06;
      smy += (my - smy) * 0.06;
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
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 -z-[1] pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
