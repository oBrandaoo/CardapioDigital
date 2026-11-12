"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FALLBACK_REFRESH_MS = 20_000;

// Refreshes the musician's queue when a request is created or changes.
// Realtime must be authenticated before subscribing: RLS only sends queue rows
// to their musician, and an anonymous channel receives nothing.
export function QueueLiveRefresh({ performanceId }: { performanceId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    async function subscribe() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`queue-${performanceId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "music_requests",
            filter: `performance_id=eq.${performanceId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    }
    void subscribe();

    // Safety net for flaky connections (bar Wi-Fi, phone sleeping).
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, FALLBACK_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [performanceId, router]);

  return null;
}
