import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
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
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        surface: "var(--surface)",
        border: "var(--border)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        "primary-hover": "var(--primary-hover)",
        secondary: "var(--secondary)",
        "secondary-foreground": "var(--secondary-foreground)",
        "secondary-hover": "var(--secondary-hover)",
        accent: "var(--accent)",
        "accent-foreground": "var(--accent-foreground)",
        danger: "var(--danger)",
        "danger-foreground": "var(--danger-foreground)",
        ring: "var(--ring)",
      },
      fontFamily: {
        sans: ["var(--font-nunito-sans)", "system-ui", "sans-serif"],
        heading: ["var(--font-rubik)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        token: "var(--shadow-md)",
        "token-lg": "var(--shadow-lg)",
        "token-xl": "var(--shadow-xl)",
      },
      transitionDuration: {
        // Spec says 200-300ms; 240 is a comfortable midpoint
        DEFAULT: "240ms",
      },
    },
  },
  plugins: [],
};
export default config;
