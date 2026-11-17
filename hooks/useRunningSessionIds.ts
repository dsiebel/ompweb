import { useEffect, useState } from "react";
import { openEventStream } from "@/lib/event-stream";

/**
 * Session ids omp is running right now, from the shared stream's `running`
 * channel (the one the sidebar uses). One subscription per page is cheap: the
 * worker multiplexes it onto the browser's single connection.
 */
export function useRunningSessionIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const source = openEventStream({ kind: "running" });
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; runningSessionIds?: string[] };
        if (data.type === "running") setIds(new Set(data.runningSessionIds ?? []));
      } catch {
        // ignore malformed frames
      }
    };
    // The stream reconnects and sends a fresh list; keep the last known one
    // rather than blinking every live tab to idle on a transient drop.
    return () => source.close();
  }, []);
  return ids;
}
