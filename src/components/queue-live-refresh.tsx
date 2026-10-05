"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function QueueLiveRefresh({ performanceId }: { performanceId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [performanceId, router]);

  return null;
}
