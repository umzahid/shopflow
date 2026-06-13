import type { Metadata } from "next";
import { Nunito_Sans, Rubik } from "next/font/google";

import { Providers } from "@/app/providers";
import "./globals.css";

// adjustFontFallback: false skips the size-adjust metric calc that
// requires a network round-trip to fonts.gstatic.com — fixes the
// "Failed to find font override values" warning in restricted/CI envs.
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

export const metadata: Metadata = {
  title: "ShopFlow — Marketplace for independent merchants",
  description:
    "Search thousands of products from independent merchants. Verified sellers, secure checkout, fast shipping.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Inline script flips .dark before paint so users who prefer dark never
    // see a flash of light. Honors stored choice; falls back to OS preference.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(_){}})();`,
          }}
        />
      </head>
      <body className={`${rubik.variable} ${nunito.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-secondary focus:px-3 focus:py-2 focus:text-secondary-foreground"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
