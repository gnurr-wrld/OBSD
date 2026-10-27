import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Obsessed LTD (OBSD) — Tranquility in Each Stitch",
  description:
    "Obsessed LTD (OBSD) — Tranquility in each stitch. Heavyweight organic loungewear crafted in deep canopy green, oat beige, slate gray, and espresso maroon.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${montserrat.variable}`}>
      <body className="antialiased selection:bg-[#5E1B24] selection:text-[#F5F1E9]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

