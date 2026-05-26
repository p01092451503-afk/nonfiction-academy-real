// Global capture of the beforeinstallprompt event so any UI (MyPage button,
// install banner, etc.) can trigger the native install dialog later.
// Browsers fire this event once, early — we must listen at app boot.

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = (available: boolean) => void;

let deferredPrompt: BIPEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((l) => l(!!deferredPrompt && !installed));

export const isStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  // @ts-ignore iOS Safari
  if (window.navigator.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true;
};

export const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
};

export const getBrowserHint = (): "chrome" | "safari" | "samsung" | "edge" | "firefox" | "other" => {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/CriOS|Chrome/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
};

if (typeof window !== "undefined") {
  installed = isStandalone();

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export const isAppInstalled = () => installed;
export const isInstallAvailable = () => !!deferredPrompt && !installed;

export const subscribeInstallState = (l: Listener): (() => void) => {
  listeners.add(l);
  l(isInstallAvailable());
  return () => listeners.delete(l);
};

export const triggerInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
  if (!deferredPrompt) return "unavailable";
  try {
    await deferredPrompt.prompt();
    const res = await deferredPrompt.userChoice;
    if (res.outcome === "accepted") {
      installed = true;
    }
    deferredPrompt = null;
    notify();
    return res.outcome;
  } catch {
    deferredPrompt = null;
    notify();
    return "unavailable";
  }
};
