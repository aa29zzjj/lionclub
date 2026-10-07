import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        lion: {
          gold: "#C8A951",
          goldLight: "#E3CB85",
          navy: "#12224A",
          navyLight: "#1E3A6E",
          navyDeep: "#0B1733",
          cream: "#FBF7EE",
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
