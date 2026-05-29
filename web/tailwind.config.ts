import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Inter"', "system-ui", "sans-serif"],
        display: ['"Fraunces"', "Georgia", "serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        // True-black neutral surfaces
        ink: {
          900: "#000000",
          800: "#050505",
          700: "#0a0a0b",
          600: "#101012",
          500: "#161618",
          400: "#1f1f22",
        },
        // `ice` kept as the class name across components, but remapped to a
        // cool-neutral white→grey scale: body text reads clean white/grey,
        // gold is reserved purely for accents.
        ice: {
          50:  "#fafafa",
          100: "#f1f1f3",
          200: "#dadadf",
          300: "#b4b5bc",
          400: "#8a8b93",
          500: "#62636b",
          600: "#45464d",
          700: "#2c2d33",
        },
        // The single accent — warm gold.
        gold: {
          DEFAULT: "#c9a86a",
          soft:    "#e6cf9c",
          deep:    "#9c7e44",
        },
      },
      animation: {
        "rise":        "rise 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-soft":  "pulse-soft 2.6s ease-in-out infinite",
        "shimmer":     "shimmer 1.8s linear infinite",
        "scroll-cue":  "scroll-cue 1.8s ease-in-out infinite",
      },
      keyframes: {
        rise:  { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-soft": {
          "0%,100%": { opacity: "1", boxShadow: "0 0 0 3px rgba(52,211,153,0.18)" },
          "50%":     { opacity: "0.6", boxShadow: "0 0 0 7px rgba(52,211,153,0)" },
        },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "scroll-cue": {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(300%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
