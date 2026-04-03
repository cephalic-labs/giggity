import type { Metadata } from "next";
import { Playfair_Display, Lora, DM_Mono } from "next/font/google";
import "./globals.css";

const serifFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

const loraFont = Lora({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
});

const monoFont = DM_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Giggity | Parametric Income Insurance",
  description: "AI-Powered Parametric Income Insurance for Gig Workers. No claims, no forms, no waiting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${serifFont.variable} ${loraFont.variable} ${monoFont.variable} min-h-screen antialiased selection:bg-[#C0392B] selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
