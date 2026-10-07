import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lion: {
          gold: "#C8A951",
          goldLight: "#E3CB85",
          navy: "#141B30",
          navyLight: "#232C4A",
          navyDeep: "#0A0D18",
          card: "#141A2B",
          cream: "#F3F1EA",
          muted: "#8B92A8",
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
