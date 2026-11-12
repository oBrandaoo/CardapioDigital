"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the current page periodically while it is visible.
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, router]);
  return null;
}
