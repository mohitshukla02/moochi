import type { Metadata, Viewport } from "next";
import { Bitcount_Grid_Single, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

// Inter carries the body, Inter Tight the section heading, and Bitcount Grid
// Single the wordmark only — it is a display face and unreadable at body size.
const inter = Inter({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-inter",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-inter-tight",
});

const bitcount = Bitcount_Grid_Single({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bitcount",
});

export const metadata: Metadata = {
  title: "Moochi",
  description: "One shared movie list.",
  icons: { icon: "/moochi-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${interTight.variable} ${bitcount.variable} bg-neutral-950 font-sans text-neutral-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
