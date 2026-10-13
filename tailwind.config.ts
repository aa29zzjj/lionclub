import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lion: {
          gold: "rgb(var(--lion-gold) / <alpha-value>)",
          goldLight: "rgb(var(--lion-gold-light) / <alpha-value>)",
          action: "rgb(var(--lion-action) / <alpha-value>)",
          actionHover: "rgb(var(--lion-action-hover) / <alpha-value>)",
          navy: "#141B30",
          navyLight: "#232C4A",
          navyDeep: "#0A0D18",
          card: "rgb(var(--lion-surface) / <alpha-value>)",
          cream: "rgb(var(--lion-text) / <alpha-value>)",
          muted: "rgb(var(--lion-muted) / <alpha-value>)",
          page: "rgb(var(--lion-page) / <alpha-value>)",
          canvas: "rgb(var(--lion-canvas) / <alpha-value>)",
          border: "rgb(var(--lion-border))",
          soft: "rgb(var(--lion-soft))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
