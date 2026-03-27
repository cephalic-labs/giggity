import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giggity | Worker Protection",
  description: "AI-Powered Parametric Income Insurance for Gig Workers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[#09090b] text-zinc-50 selection:bg-blue-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#09090b] to-[#09090b] -z-10" />
        {children}
      </body>
    </html>
  );
}
