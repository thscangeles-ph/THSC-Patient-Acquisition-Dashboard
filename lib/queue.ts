"use client";

import { useSyncExternalStore } from "react";

export type ClinicId = "clinic-1" | "clinic-2" | "clinic-3";
export type Priority = "regular" | "priority";
export type TicketStatus = "waiting" | "serving" | "done" | "no-show";

export type Clinic = { id: ClinicId; name: string; code: string; doctor: string; open: boolean };
export type Ticket = {
  id: string; number: string; clinicId: ClinicId; patientName: string; priority: Priority; note: string;
  status: TicketStatus; createdAt: number; calledAt: number | null; finishedAt: number | null;
};
export type LastCall = { ticketId: string; number: string; clinicId: ClinicId; at: number };
export type QueueState = {
  version: 1; day: string; clinics: Clinic[]; tickets: Ticket[];
  counters: Record<ClinicId, number>; lastCall: LastCall | null;
};

export const CLINIC_IDS: ClinicId[] = ["clinic-1", "clinic-2", "clinic-3"];
const STORAGE_KEY = "thsc-clinic-queue-v1";
const CHANNEL_NAME = "thsc-clinic-queue";
export const DEFAULT_SERVICE_MINUTES = 15;

const defaultClinics = (): Clinic[] => CLINIC_IDS.map((id, index) => ({ id, name: `Clinic ${index + 1}`, code: `C${index + 1}`, doctor: "", open: true }));
const emptyCounters = (): Record<ClinicId, number> => ({ "clinic-1": 0, "clinic-2": 0, "clinic-3": 0 });
const today = () => new Date().toLocaleDateString("en-CA");

function freshState(clinics: Clinic[] = defaultClinics()): QueueState {
  return { version: 1, day: today(), clinics, tickets: [], counters: emptyCounters(), lastCall: null };
}

// Server render and first client render share this snapshot so hydration matches.
const SERVER_STATE: QueueState = { ...freshState(), day: "" };

function isQueueState(value: unknown): value is QueueState {
  const v = value as QueueState;
  return !!v && v.version === 1 && Array.isArray(v.clinics) && Array.isArray(v.tickets) && typeof v.counters === "object";
}

// A new calendar day starts a new queue but keeps each clinic's doctor and open/closed setting.
const rollOver = (state: QueueState): QueueState => state.day === today() ? state : freshState(state.clinics);

let state: QueueState | null = null;

function readStorage(): QueueState {
  let stored: unknown = null;
  try { stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"); } catch { /* blocked or corrupt: fall back to memory */ }
  return rollOver(isQueueState(stored) ? stored : state ?? freshState());
}
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function emit() { listeners.forEach((listener) => listener()); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<unknown>) => { if (isQueueState(event.data)) { state = event.data; emit(); } };
    }
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { channel?.close(); channel = null; window.removeEventListener("storage", onStorage); }
  };
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  state = readStorage(); emit();
}

function getSnapshot(): QueueState {
  if (!state) state = readStorage();
  return state;
}

function commit(update: (current: QueueState) => QueueState) {
  // Re-read storage so a change made in another tab is never overwritten.
  const next = update(readStorage());
  state = next;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  channel?.postMessage(next);
  emit();
}

export function useQueue(): QueueState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

// Ticking clock for wait times. Returns 0 until mounted on the client.
let now = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    now = Date.now();
    clockTimer = setInterval(() => { now = Date.now(); clockListeners.forEach((l) => l()); }, 10_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size && clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  };
}
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => now, () => 0);
}

// Priority patients (senior citizens, PWD, pregnant) go first, then first come, first served.
export function waitingFor(state: QueueState, clinicId: ClinicId): Ticket[] {
  return state.tickets
    .filter((t) => t.clinicId === clinicId && t.status === "waiting")
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "priority" ? -1 : 1) || a.createdAt - b.createdAt);
}
export const servingAt = (state: QueueState, clinicId: ClinicId) => state.tickets.find((t) => t.clinicId === clinicId && t.status === "serving") ?? null;
export const clinicById = (state: QueueState, clinicId: ClinicId) => state.clinics.find((c) => c.id === clinicId) ?? defaultClinics().find((c) => c.id === clinicId)!;

export function averageServiceMinutes(state: QueueState, clinicId: ClinicId): number {
  const durations = state.tickets
    .filter((t) => t.clinicId === clinicId && t.status === "done" && t.calledAt && t.finishedAt)
    .map((t) => (t.finishedAt! - t.calledAt!) / 60_000);
  if (!durations.length) return DEFAULT_SERVICE_MINUTES;
  return Math.max(1, durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

export function averageWaitMinutes(state: QueueState): number | null {
  const waits = state.tickets.filter((t) => t.calledAt).map((t) => (t.calledAt! - t.createdAt) / 60_000);
  return waits.length ? waits.reduce((sum, value) => sum + value, 0) / waits.length : null;
}

const finish = (ticket: Ticket, status: "done" | "no-show"): Ticket => ({ ...ticket, status, finishedAt: Date.now() });
const mapTicket = (current: QueueState, id: string, fn: (t: Ticket) => Ticket): QueueState => ({ ...current, tickets: current.tickets.map((t) => t.id === id ? fn(t) : t) });

function serve(current: QueueState, ticket: Ticket): QueueState {
  const at = Date.now();
  return {
    ...current,
    // Whoever was with the doctor is finished once the next patient is called in.
    tickets: current.tickets.map((t) => t.id === ticket.id ? { ...t, status: "serving", calledAt: at }
      : t.clinicId === ticket.clinicId && t.status === "serving" ? finish(t, "done") : t),
    lastCall: { ticketId: ticket.id, number: ticket.number, clinicId: ticket.clinicId, at },
  };
}

export const queue = {
  addPatient(input: { clinicId: ClinicId; patientName: string; priority: Priority; note: string }): Ticket {
    let created: Ticket | null = null;
    commit((current) => {
      const seq = (current.counters[input.clinicId] || 0) + 1;
      const clinic = clinicById(current, input.clinicId);
      created = {
        id: `${input.clinicId}-${current.day}-${seq}-${Math.random().toString(36).slice(2, 7)}`,
        number: `${clinic.code}-${String(seq).padStart(3, "0")}`, clinicId: input.clinicId,
        patientName: input.patientName.trim(), priority: input.priority, note: input.note.trim(),
        status: "waiting", createdAt: Date.now(), calledAt: null, finishedAt: null,
      };
      return { ...current, counters: { ...current.counters, [input.clinicId]: seq }, tickets: [...current.tickets, created] };
    });
    return created!;
  },
  callNext(clinicId: ClinicId) {
    commit((current) => {
      const next = waitingFor(current, clinicId)[0];
      if (next) return serve(current, next);
      const serving = servingAt(current, clinicId);
      return serving ? mapTicket(current, serving.id, (t) => finish(t, "done")) : current;
    });
  },
  call(ticketId: string) {
    commit((current) => {
      const ticket = current.tickets.find((t) => t.id === ticketId);
      return ticket ? serve(current, ticket) : current;
    });
  },
  recall(ticketId: string) {
    commit((current) => {
      const ticket = current.tickets.find((t) => t.id === ticketId);
      return ticket ? { ...current, lastCall: { ticketId, number: ticket.number, clinicId: ticket.clinicId, at: Date.now() } } : current;
    });
  },
  complete(ticketId: string) { commit((current) => mapTicket(current, ticketId, (t) => finish(t, "done"))); },
  noShow(ticketId: string) { commit((current) => mapTicket(current, ticketId, (t) => finish(t, "no-show"))); },
  // Late arrivals and patients sent back keep their original arrival time and therefore their place in line.
  requeue(ticketId: string) { commit((current) => mapTicket(current, ticketId, (t) => ({ ...t, status: "waiting", calledAt: null, finishedAt: null }))); },
  // A transferred patient gets the new clinic's next number but keeps their arrival time.
  transfer(ticketId: string, clinicId: ClinicId) {
    commit((current) => {
      const ticket = current.tickets.find((t) => t.id === ticketId);
      if (!ticket || ticket.clinicId === clinicId) return current;
      const seq = (current.counters[clinicId] || 0) + 1;
      const number = `${clinicById(current, clinicId).code}-${String(seq).padStart(3, "0")}`;
      return {
        ...mapTicket(current, ticketId, (t) => ({ ...t, clinicId, number, status: "waiting", calledAt: null, finishedAt: null })),
        counters: { ...current.counters, [clinicId]: seq },
        lastCall: current.lastCall?.ticketId === ticketId ? null : current.lastCall,
      };
    });
  },
  remove(ticketId: string) {
    commit((current) => ({ ...current, tickets: current.tickets.filter((t) => t.id !== ticketId), lastCall: current.lastCall?.ticketId === ticketId ? null : current.lastCall }));
  },
  updateClinic(clinicId: ClinicId, patch: Partial<Pick<Clinic, "doctor" | "open">>) {
    commit((current) => ({ ...current, clinics: current.clinics.map((c) => c.id === clinicId ? { ...c, ...patch } : c) }));
  },
  resetDay() { commit((current) => freshState(current.clinics)); },
};
