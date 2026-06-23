import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        chiikawa: {
          pink: "#f9a8d4",
          yellow: "#fde68a",
          blue: "#93c5fd",
        },
      },
    },
  },
  plugins: [],
};

export default config;
