import { useEffect, useState } from "react";
import { openEventStream } from "@/lib/event-stream";

export interface SessionActivity {
  /** Sessions omp is running right now. */
  running: ReadonlySet<string>;
  /** Running sessions blocked on a question for the user. */
  awaitingInput: ReadonlySet<string>;
}

const EMPTY: SessionActivity = { running: new Set(), awaitingInput: new Set() };

/**
 * Live session activity from the shared `running` channel (the one the sidebar
 * uses): who is running, and who is waiting for an answer. One subscription per
 * page is cheap — the worker multiplexes it onto the browser's connection.
 */
export function useSessionActivity(): SessionActivity {
  const [activity, setActivity] = useState<SessionActivity>(EMPTY);
  useEffect(() => {
    const source = openEventStream({ kind: "running" });
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          runningSessionIds?: string[];
          runningSessions?: Array<{ id?: string; awaitingInput?: boolean }>;
        };
        if (data.type !== "running") return;
        const awaitingInput = new Set<string>();
        for (const place of data.runningSessions ?? []) {
          if (place.id && place.awaitingInput) awaitingInput.add(place.id);
        }
        setActivity({ running: new Set(data.runningSessionIds ?? []), awaitingInput });
      } catch {
        // ignore malformed frames
      }
    };
    // The stream reconnects and sends a fresh list; keep the last known one
    // rather than blinking every live tab to idle on a transient drop.
    return () => source.close();
  }, []);
  return activity;
}
