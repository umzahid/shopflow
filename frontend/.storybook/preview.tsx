import type { Preview } from "@storybook/nextjs-vite";
import { Nunito_Sans, Rubik } from "next/font/google";

import "../src/app/globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rubik",
  display: "swap",
  adjustFontFallback: false,
});

const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-nunito-sans",
  display: "swap",
  adjustFontFallback: false,
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "Light",
      values: [
        { name: "Light", value: "#faf5ff" },
        { name: "Dark", value: "#0f0a1f" },
      ],
    },
    a11y: { test: "todo" },
  },
  globalTypes: {
    theme: {
      description: "Color theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      return (
        <div className={`${rubik.variable} ${nunito.variable} font-sans bg-background text-foreground min-h-[100px] p-4`}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
