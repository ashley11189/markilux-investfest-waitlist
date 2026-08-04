import type { Metadata, Viewport } from "next";
import { Archivo, Open_Sans } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted at build time by next/font. The export pulled Archivo
 * and Open Sans from fonts.googleapis.com, which fails on the kind of Wi-Fi a
 * convention centre provides. These ship with the bundle instead.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-open-sans",
  display: "swap",
});

const title = "markilux — Private Sale List · InvestFest 2026";
const description =
  "Join the markilux USA Private Sale list at InvestFest 2026. German engineered shading at private sale pricing, released to our list before it opens to the market.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://markilux-investfest.vercel.app",
  ),
  title,
  description,
  applicationName: "markilux Private Sale List",
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "markilux USA",
    images: [{ url: "/img/awning-hero-1280.webp", width: 1280, height: 720 }],
  },
  twitter: { card: "summary_large_image", title, description },
  // A lead-capture page has no business in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f3f2f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
