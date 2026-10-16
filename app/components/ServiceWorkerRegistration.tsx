"use client";

import { useEffect } from "react";
// Side-effect: register beforeinstallprompt listener on first client bundle eval
// so InstallPrompt on `/` can still see an event that fired on another route.
import "@/app/lib/before-install-prompt";

/** Production only: a dev worker fights HMR and can pin a stale shell. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration leaves the site as a normal tab. Do not surface it.
    });
  }, []);

  return null;
}
