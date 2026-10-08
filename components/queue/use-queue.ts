"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, ensureDay } from "@/lib/queue/reducer";
import type { ActionResult, QueueAction, QueueState } from "@/lib/queue/types";

export type SyncMode = "detecting" | "local" | "server";

const LOCAL_KEY = "thsc-queue-state-v1";
const PIN_KEY = "thsc-queue-pin";
const CHANNEL = "thsc-queue";
const POLL_MS = 2000;

type ServerResponse = { mode: "local" | "server"; staff?: boolean; version?: number; state?: QueueState; unchanged?: boolean; result?: ActionResult; error?: string };

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private mode); the queue still works for this tab.
  }
}

function readLocalState(): QueueState {
  const raw = readStorage(LOCAL_KEY);
  let parsed: QueueState | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as QueueState) : null;
  } catch {
    parsed = null;
  }
  return ensureDay(parsed, Date.now());
}

/**
 * Live queue state for every queue screen.
 * - Shared mode (server storage configured): polls /api/queue so the desk, stations, TV and phones stay in sync.
 * - Single-device mode: state lives in this browser and syncs between its tabs/windows (e.g. a TV on the desk PC's second screen).
 */
export function useQueue() {
  const [state, setState] = useState<QueueState | null>(null);
  const [mode, setMode] = useState<SyncMode>("detecting");
  const [staff, setStaff] = useState(false);
  const [pinRejected, setPinRejected] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const versionRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const apply = useCallback((body: ServerResponse) => {
    const pin = readStorage(PIN_KEY);
    setStaff(Boolean(body.staff));
    setPinRejected(Boolean(pin) && !body.staff);
    if (typeof body.version === "number") versionRef.current = body.version;
    if (body.state) setState(body.state);
  }, []);

  const request = useCallback(async (init?: RequestInit, since?: number | null) => {
    const pin = readStorage(PIN_KEY);
    const url = since === null || since === undefined ? "/api/queue" : `/api/queue?since=${since}`;
    const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...(pin ? { "x-queue-pin": pin } : {}) } });
    const body = (await response.json().catch(() => ({ mode: "server", error: `Server error ${response.status}` }))) as ServerResponse;
    return { response, body };
  }, []);

  // Detect the sync mode once, then keep state fresh.
  useEffect(() => {
    let cancelled = false;
    let detected = false;
    let local = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const startLocal = () => {
      local = true;
      setMode("local");
      setStaff(true);
      setState(readLocalState());
      const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
      channelRef.current = channel;
      if (channel) channel.onmessage = () => setState(readLocalState());
    };

    const poll = async () => {
      try {
        const { response, body } = await request(undefined, versionRef.current);
        if (cancelled) return;
        // Single-device mode only when the server says so, or there is no queue API at all (e.g. a static export).
        if (body.mode === "local" || (!detected && response.status === 404)) return startLocal();
        detected = true;
        setMode("server");
        setOnline(true);
        if (!response.ok) setError(body.error || "The queue server could not be reached.");
        else {
          setError("");
          apply(body.unchanged ? { ...body, state: undefined } : body);
        }
      } catch {
        if (cancelled) return;
        // A network failure is never a reason to switch to a separate, device-only queue: keep retrying.
        setOnline(false);
        if (!detected) setError("No connection to the queue server. Retrying…");
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    const onStorage = (event: StorageEvent) => { if (local && event.key === LOCAL_KEY) setState(readLocalState()); };
    window.addEventListener("storage", onStorage);
    // Roll the queue over at midnight even when nobody touches it.
    const dayTimer = setInterval(() => setState((current) => (current ? ensureDay(current, Date.now()) : current)), 30000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(dayTimer);
      window.removeEventListener("storage", onStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [apply, request, refreshKey]);

  const dispatch = useCallback(async (action: QueueAction): Promise<ActionResult> => {
    if (mode === "local") {
      const { state: next, result } = applyAction(readLocalState(), action, Date.now());
      if (result.ok) {
        writeStorage(LOCAL_KEY, JSON.stringify(next));
        channelRef.current?.postMessage("changed");
        setState(next);
      }
      return result;
    }
    if (mode !== "server") return { ok: false, error: "The queue is still connecting. Try again in a moment." };
    try {
      const { body } = await request({ method: "POST", body: JSON.stringify({ action }) });
      apply(body);
      return body.result ?? { ok: false, error: body.error || "The action could not be saved." };
    } catch {
      setOnline(false);
      return { ok: false, error: "No connection to the queue server. Check the clinic network and try again." };
    }
  }, [apply, mode, request]);

  const setPin = useCallback((pin: string | null) => {
    writeStorage(PIN_KEY, pin);
    versionRef.current = null;
    setRefreshKey((value) => value + 1);
  }, []);

  return { state, mode, staff, pinRejected, error, online, dispatch, setPin };
}

/** Current time that ticks on an interval; null until mounted so server and client renders match. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [intervalMs]);
  return now;
}

export { readStorage, writeStorage };
