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
        ink: {
          900: "#050810",
          800: "#080d18",
          700: "#0c1322",
          600: "#111b30",
          500: "#16223d",
          400: "#1d2b4a",
        },
        ice: {
          50:  "#f1f7ff",
          100: "#dbeaff",
          200: "#b9d5ff",
          300: "#8fbaff",
          400: "#6c9eff",
          500: "#4a82ff",
          600: "#2e63eb",
          700: "#1e4ac9",
        },
        gold: { DEFAULT: "#d4af6a", soft: "#f0d9a6" },
      },
      animation: {
        "aurora-pan": "aurora-pan 30s ease-in-out infinite alternate",
        "rise":       "rise 0.7s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-soft": "pulse-soft 2.6s ease-in-out infinite",
        "shimmer":    "shimmer 1.8s linear infinite",
      },
      keyframes: {
        "aurora-pan": {
          "0%":   { backgroundPosition: "0% 0%, 100% 100%, 50% 50%, 0 0" },
          "50%":  { backgroundPosition: "12% 8%, 88% 92%, 58% 42%, 0 0" },
          "100%": { backgroundPosition: "4% 14%, 96% 86%, 45% 55%, 0 0" },
        },
        rise:  { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-soft": {
          "0%,100%": { opacity: "1", boxShadow: "0 0 0 4px rgba(74,130,255,0.18)" },
          "50%":     { opacity: "0.7", boxShadow: "0 0 0 10px rgba(74,130,255,0)" },
        },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};
export default config;
