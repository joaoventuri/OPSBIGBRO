import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#e5e5e5",
        card: { DEFAULT: "#111111", foreground: "#e5e5e5" },
        popover: { DEFAULT: "#111111", foreground: "#e5e5e5" },
        primary: { DEFAULT: "#22c55e", foreground: "#0a0a0a" },
        secondary: { DEFAULT: "#1a1a1a", foreground: "#a3a3a3" },
        muted: { DEFAULT: "#1a1a1a", foreground: "#737373" },
        accent: { DEFAULT: "#166534", foreground: "#22c55e" },
        destructive: { DEFAULT: "#ef4444", foreground: "#fafafa" },
        border: "#262626",
        input: "#262626",
        ring: "#22c55e",
        neon: "#22c55e",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
