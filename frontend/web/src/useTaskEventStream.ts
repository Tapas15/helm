import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type TaskEvent = { id: string; sequence: number; type: string; source: string; ts: string; payload: unknown };

export function useTaskEventStream(taskId: string | null) {
  const qc = useQueryClient();
  const lastSeq = useRef(-1);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!taskId) { setStale(false); return; }
    lastSeq.current = -1;
    setStale(false);
    qc.setQueryData<{ events: TaskEvent[] }>(["events", taskId], { events: [] });
    let disposed = false;
    let staleHandle = 0;
    let es: EventSource | null = null;

    const open = () => {
      if (disposed) return;
      es = new EventSource(`/v1/events/stream?taskId=${encodeURIComponent(taskId)}&after=${lastSeq.current}`);
      const touch = () => { setStale(false); window.clearTimeout(staleHandle); staleHandle = window.setTimeout(() => setStale(true), 5000); };
      touch();
      es.addEventListener("event", (msg) => {
        touch();
        const evt = JSON.parse((msg as MessageEvent).data) as TaskEvent;
        if (evt.sequence <= lastSeq.current) return;
        lastSeq.current = Math.max(lastSeq.current, evt.sequence);
        qc.setQueryData<{ events: TaskEvent[] }>(["events", taskId], (old) => {
          const prev = old?.events ?? [];
          if (prev.some((e) => e.id === evt.id || e.sequence === evt.sequence)) return old ?? { events: prev };
          const next = [...prev, evt].sort((a, b) => a.sequence - b.sequence);
          return { events: next };
        });
        if (evt.type.startsWith("task.")) qc.invalidateQueries({ queryKey: ["tasks"] });
      });
      es.addEventListener("heartbeat", touch);
      es.onerror = () => {
        setStale(true);
        window.clearTimeout(staleHandle);
        es?.close();
        if (!disposed) window.setTimeout(open, 1500);
      };
    };

    open();
    return () => { disposed = true; window.clearTimeout(staleHandle); es?.close(); };
  }, [taskId, qc]);

  const data = qc.getQueryData<{ events: TaskEvent[] }>(["events", taskId ?? ""]);
  return { events: data?.events ?? [], stale, lastSequence: lastSeq.current };
}
