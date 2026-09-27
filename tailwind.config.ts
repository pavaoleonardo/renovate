import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      maxWidth: {
        // Single content frame for the whole app (nav, lists, editor, landing).
        // Wider than the previous max-w-5xl (1024px) so the layout matches the
        // competing estimate tools, which run ~1220px+ on a desktop screen.
        shell: "1400px",
      },
    },
  },
  plugins: [],
};
export default config;
