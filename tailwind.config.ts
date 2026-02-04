import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#0b0b0b",
        smoke: "rgba(255,255,255,0.7)",
        canvas: "#f6f1e8",
      },
    },
  },
  plugins: [],
};

export default config;
