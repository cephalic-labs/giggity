"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptMode = "native" | "ios" | "manual" | null;

const DISMISS_STORAGE_KEY = "pwa-install-dismissed";

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [mode, setMode] = useState<PromptMode>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const frame = window.requestAnimationFrame(() => {
      const storedDismissed = window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIOS =
        /iphone|ipad|ipod/.test(userAgent) ||
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

      setDismissed(storedDismissed);
      setIsInstalled(standalone);

      if (!standalone) {
        setMode(isIOS ? "ios" : "manual");
      }

      setIsReady(true);
    });

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setMode("native");
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setMode(null);
      setIsInstalled(true);
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    }
    setInstallEvent(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
    }
  };

  const visible = isReady && !dismissed && !isInstalled && !!mode;
  const isNativePrompt = mode === "native" && !!installEvent;
  const title = isNativePrompt ? "Install Giggity" : "Install the app";
  const message =
    mode === "ios"
      ? "Tap Share, then choose Add to Home Screen."
      : isNativePrompt
        ? "Install Giggity for faster access and app-like navigation."
        : "Open your browser menu and choose Install app or Add to Home Screen.";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 border border-[#1A1A1A]/20 bg-[#1A1A1A] px-5 py-3 shadow-2xl"
          role="banner"
          aria-label="Install Giggity app"
        >
          <Download className="h-5 w-5 shrink-0 text-[#C0392B]" aria-hidden />
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase leading-none tracking-widest text-white">
              {title}
            </p>
            <p className="mt-1 font-body text-xs text-white/50">{message}</p>
          </div>
          {isNativePrompt ? (
            <button
              onClick={handleInstall}
              className="ml-1 shrink-0 bg-[#C0392B] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-white transition-colors hover:bg-[#a93226]"
            >
              Install
            </button>
          ) : (
            <span className="ml-1 shrink-0 border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white/70">
              Browser Menu
            </span>
          )}
          <button
            onClick={handleDismiss}
            className="shrink-0 text-white/40 transition-colors hover:text-white/70"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
