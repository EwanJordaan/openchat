import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { getPublicSiteConfig } from "@/app/lib/site-config";
import { OPENCHAT_THEME_IDS } from "@/shared/themes";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenChat - AI Chat UI Template",
  description: "A polished Next.js AI chat interface template with Tailwind CSS.",
};

const publicSiteConfig = getPublicSiteConfig();

const themeBootstrapScript = `(() => {
  try {
    const key = "openchat_theme";
    const fallback = ${JSON.stringify(publicSiteConfig.ui.defaultTheme)};
    const allowed = new Set(${JSON.stringify(OPENCHAT_THEME_IDS)});
    const raw = window.localStorage.getItem(key);
    const normalized = raw ? raw.trim().toLowerCase() : "";
    const theme = allowed.has(normalized) ? normalized : fallback;
    document.documentElement.dataset.theme = theme;
    if (document.body) {
      document.body.dataset.theme = theme;
    }
  } catch {
    document.documentElement.dataset.theme = ${JSON.stringify(publicSiteConfig.ui.defaultTheme)};
    if (document.body) {
      document.body.dataset.theme = ${JSON.stringify(publicSiteConfig.ui.defaultTheme)};
    }
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={publicSiteConfig.ui.defaultTheme} suppressHydrationWarning>
      <body
        data-theme={publicSiteConfig.ui.defaultTheme}
        className={`${spaceGrotesk.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {children}
      </body>
    </html>
  );
}
