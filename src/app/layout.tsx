import type { Metadata, Viewport } from "next";
import { Cormorant, Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#172A1E",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://obsd.co.za"
  ),
  title: {
    default: "Obsessed LTD (OBSD) — Tranquility in Each Stitch",
    template: "%s | Obsessed LTD",
  },
  description:
    "Obsessed LTD (OBSD) — Tranquility in each stitch. Heavyweight 500 GSM organic fleece loungewear crafted in deep canopy green, oat beige, forest sage, slate blue, and charcoal grey.",
  keywords: [
    "Obsessed LTD",
    "OBSD",
    "Loungewear South Africa",
    "Quiet Luxury Loungewear",
    "Heavyweight Organic Fleece",
    "Wide-Leg Joggers",
    "Lounge Shorts",
    "Cape Town Luxury Fashion",
  ],
  authors: [{ name: "Obsessed LTD" }],
  creator: "Obsessed LTD",
  publisher: "Obsessed LTD",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/products/obsd-logo.jpg", type: "image/jpeg" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png" },
      { url: "/products/obsd-logo.jpg", type: "image/jpeg" },
    ],
    shortcut: "/icon.png",
  },
  openGraph: {
    title: "Obsessed LTD (OBSD) — Tranquility in Each Stitch",
    description:
      "Heavyweight 500 GSM organic fleece loungewear crafted in deep canopy green, oat beige, forest sage, slate blue, and charcoal grey. Designed for stillness and effortless drape.",
    url: "/",
    siteName: "Obsessed LTD (OBSD)",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Obsessed LTD (OBSD) Luxury Loungewear",
      },
    ],
    locale: "en_ZA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Obsessed LTD (OBSD) — Tranquility in Each Stitch",
    description:
      "Heavyweight 500 GSM organic fleece loungewear crafted in deep canopy green, oat beige, forest sage, slate blue, and charcoal grey.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
      <body className="antialiased selection:bg-[#172A1E] selection:text-[#D4AF37]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

