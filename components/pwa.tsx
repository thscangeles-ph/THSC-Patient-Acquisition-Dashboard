"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Registers the service worker that makes the app installable (production builds only). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Install app" button. Android and desktop Chrome/Edge show the browser's install prompt;
 * iPhone and iPad (which have no prompt) get Add to Home Screen instructions instead.
 */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => setPrompt(null);
    const detect = setTimeout(() => setIos(isIos() && !isStandalone()), 0);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { clearTimeout(detect); window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!prompt && !ios) return null;
  const install = async () => {
    if (!prompt) { setShowTip(true); return; }
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void install()} className={className}><Download size={15} /> Install app</Button>
      {showTip && (
        <div role="dialog" aria-label="Install on iPhone or iPad" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 text-[#2e291f] shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold">Install on iPhone or iPad</p>
            <button type="button" onClick={() => setShowTip(false)} aria-label="Close" className="text-[#756b59]"><X size={18} /></button>
          </div>
          <ol className="mt-3 grid gap-2 text-sm leading-6">
            <li>1. In Safari, tap the <Share size={15} className="inline align-text-bottom" /> <strong>Share</strong> button.</li>
            <li>2. Tap <strong>Add to Home Screen</strong>.</li>
            <li>3. Tap <strong>Add</strong>. The app opens from your home screen, full screen.</li>
          </ol>
        </div>
      )}
    </>
  );
}
