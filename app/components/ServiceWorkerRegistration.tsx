"use client";

import { useEffect } from "react";

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
