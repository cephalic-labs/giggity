import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Giggity",
  title: "Giggity | Parametric Income Insurance",
  description: "AI-Powered Parametric Income Insurance for Gig Workers. No claims, no forms, no waiting.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Giggity",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: ["/icons/icon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#C0392B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className="min-h-screen antialiased selection:bg-[#C0392B] selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
