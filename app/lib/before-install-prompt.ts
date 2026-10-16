/**
 * Capture beforeinstallprompt as soon as this module loads (root layout client import).
 * InstallPrompt mounts only on `/`; without this, a prior page or early fire loses the event.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify(event: BeforeInstallPromptEvent | null): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function onBeforeInstallPrompt(event: Event): void {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify(deferred);
}

export function getBeforeInstallPromptEvent(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function clearBeforeInstallPromptEvent(): void {
  if (deferred === null) {
    return;
  }
  deferred = null;
  notify(null);
}

export function subscribeBeforeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  if (deferred) {
    listener(deferred);
  }
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
}
