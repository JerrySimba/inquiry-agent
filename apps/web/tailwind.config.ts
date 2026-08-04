import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14212b",
        lagoon: "#0f6e6a",
        sand: "#f3ebe0",
        coral: "#c45c26",
        mist: "#d9e3e0",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
