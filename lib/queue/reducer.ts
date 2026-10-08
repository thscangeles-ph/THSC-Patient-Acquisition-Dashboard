import { parseYouTube } from "./youtube";
import type { ActionResult, Announcement, PatientKind, QueueAction, QueueState, Settings, Station, Step, Visit, VisitInput } from "./types";

export const TIME_ZONE = "Asia/Manila";
const MAX_ANNOUNCEMENTS = 20;
const MAX_STEPS = 8;

export const DEFAULT_SETTINGS: Settings = {
  stations: [
    { code: "C1", name: "Consultation 1", service: "consultation", location: "Clinic Room 1", selfCheckIn: true, active: true },
    { code: "C2", name: "Consultation 2", service: "consultation", location: "Clinic Room 2", selfCheckIn: true, active: true },
    { code: "C3", name: "Consultation 3", service: "consultation", location: "Clinic Room 3", selfCheckIn: true, active: true },
    { code: "P1", name: "Procedures (ECG / 2D Echo)", service: "procedure", location: "Procedure Room", selfCheckIn: false, active: true },
    { code: "L1", name: "Laboratory", service: "laboratory", location: "Laboratory", selfCheckIn: false, active: true },
  ],
  ticker: "Please wait for your queue number to be called. Senior citizens, PWDs and pregnant patients are served through the priority lane.",
};

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
export const clinicDay = (now: number) => dayFormat.format(new Date(now));

export function newId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function emptyState(now: number, settings: Settings = DEFAULT_SETTINGS): QueueState {
  return { day: clinicDay(now), nextSeq: 1, visits: [], announcements: [], settings: structuredClone(settings) };
}

/** Queues reset at midnight Manila time; settings carry over. */
export function ensureDay(state: QueueState | null | undefined, now: number): QueueState {
  if (!state) return emptyState(now);
  return state.day === clinicDay(now) ? state : emptyState(now, state.settings);
}

export const ticketLabel = (visit: Pick<Visit, "seq" | "kind">, station: string) => `${String(visit.seq).padStart(2, "0")}-${station}-${visit.kind}`;
/** The number given on arrival, before a station is assigned at registration, e.g. 01-W. */
export const arrivalLabel = (visit: Pick<Visit, "seq" | "kind">) => `${String(visit.seq).padStart(2, "0")}-${visit.kind}`;
/** Visits saved before arrival numbers existed have no `registered` flag; they were always registered. */
export const isRegistered = (visit: Visit) => visit.registered !== false;

export function currentStep(visit: Visit): Step | null {
  return visit.steps.find((step) => step.status !== "done") ?? null;
}

export function currentLabel(visit: Visit) {
  const step = currentStep(visit) ?? visit.steps[visit.steps.length - 1];
  return step ? ticketLabel(visit, step.station) : arrivalLabel(visit);
}

export const findStation = (state: QueueState, code: string): Station | undefined => state.settings.stations.find((station) => station.code === code);

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fail = (error: string): ActionResult => ({ ok: false, error });

function makeStep(station: string, now: number, first: boolean): Step {
  return { id: newId(), station, status: first ? "waiting" : "pending", queuedAt: first ? now : null, calledAt: null, doneAt: null, calls: 0 };
}

function announce(state: QueueState, entry: Omit<Announcement, "id">) {
  state.announcements = [...state.announcements, { id: newId(), ...entry }].slice(-MAX_ANNOUNCEMENTS);
}

function validateStations(state: QueueState, codes: unknown): string[] | string {
  if (!Array.isArray(codes) || !codes.length) return "Choose at least one service.";
  if (codes.length > MAX_STEPS) return `A visit can have at most ${MAX_STEPS} services.`;
  const result: string[] = [];
  for (const raw of codes) {
    const code = String(raw);
    const station = findStation(state, code);
    if (!station || !station.active) return `Station ${code} is not available.`;
    result.push(code);
  }
  return result;
}

function newVisit(state: QueueState, kind: PatientKind, priority: boolean, newPatient: boolean, now: number, source: Visit["source"]): Visit | string {
  if (state.visits.length >= 999) return "The daily queue limit of 999 patients has been reached.";
  const visit: Visit = {
    id: newId(),
    seq: state.nextSeq,
    kind: kind === "S" ? "S" : "W",
    name: "",
    mobile: "",
    notes: "",
    priority,
    newPatient,
    source,
    verified: source === "desk",
    cancelled: false,
    registered: false,
    regCalledAt: null,
    regCalls: 0,
    createdAt: now,
    registeredAt: null,
    messagedAt: null,
    steps: [],
  };
  state.nextSeq += 1;
  state.visits.push(visit);
  return visit;
}

/** Fills in the patient's details and services, turning an arrival number (01-W) into a ticket (01-C1-W). */
function registerVisit(state: QueueState, visit: Visit, input: VisitInput, now: number): string | null {
  const name = clean(input.name, 80);
  if (!name) return "Enter the patient's name.";
  const stations = validateStations(state, input.stations);
  if (typeof stations === "string") return stations;
  visit.kind = input.kind === "S" ? "S" : "W";
  visit.name = name;
  visit.mobile = clean(input.mobile, 20);
  visit.notes = clean(input.notes, 200);
  visit.priority = Boolean(input.priority) || visit.priority;
  if (input.newPatient !== undefined) visit.newPatient = Boolean(input.newPatient);
  visit.registered = true;
  visit.registeredAt = now;
  visit.steps = stations.map((code, index) => makeStep(code, now, index === 0));
  return null;
}

/** Arrival numbers waiting to be called for registration: priority lane first, then in order of arrival. */
export function waitingToRegister(state: QueueState): Visit[] {
  return state.visits
    .filter((visit) => !visit.cancelled && !isRegistered(visit))
    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.seq - b.seq);
}

/** Patients waiting for a station, in calling order: priority lane first, then by time queued. */
export function waitingFor(state: QueueState, station: string): Visit[] {
  return state.visits
    .filter((visit) => {
      const step = currentStep(visit);
      return !visit.cancelled && step?.station === station && step.status === "waiting";
    })
    .sort((a, b) => Number(b.priority) - Number(a.priority) || (currentStep(a)!.queuedAt ?? 0) - (currentStep(b)!.queuedAt ?? 0) || a.seq - b.seq);
}

export function servingAt(state: QueueState, station: string): Visit[] {
  return state.visits
    .filter((visit) => {
      const step = currentStep(visit);
      return !visit.cancelled && step?.station === station && step.status === "called";
    })
    .sort((a, b) => (currentStep(b)!.calledAt ?? 0) - (currentStep(a)!.calledAt ?? 0));
}

function finishStep(visit: Visit, now: number, sendTo?: string) {
  const index = visit.steps.findIndex((step) => step.status !== "done");
  if (index < 0) return;
  const step = visit.steps[index];
  step.status = "done";
  step.doneAt = now;
  const next = visit.steps[index + 1];
  if (sendTo && next?.station !== sendTo) visit.steps.splice(index + 1, 0, makeStep(sendTo, now, false));
  const following = visit.steps[index + 1];
  if (following) {
    following.status = "waiting";
    following.queuedAt = now;
  }
}

function sanitizeSettings(input: Settings): Settings | string {
  if (!input || !Array.isArray(input.stations)) return "Settings are incomplete.";
  const codes = new Set<string>();
  const stations: Station[] = [];
  for (const raw of input.stations) {
    const code = clean(raw.code, 4).toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,3}$/.test(code)) return `Station code "${raw.code}" must start with a letter and use up to 4 letters or numbers.`;
    if (codes.has(code)) return `Station code ${code} is used twice.`;
    const name = clean(raw.name, 60);
    if (!name) return `Station ${code} needs a name.`;
    codes.add(code);
    stations.push({
      code,
      name,
      service: ["consultation", "procedure", "laboratory", "other"].includes(raw.service) ? raw.service : "other",
      location: clean(raw.location, 60),
      selfCheckIn: Boolean(raw.selfCheckIn),
      active: raw.active !== false,
    });
  }
  if (!stations.length) return "Add at least one station.";
  const youtube = clean(input.youtube, 300);
  const video = parseYouTube(youtube);
  if (video && "error" in video) return `YouTube: ${video.error}`;
  return { stations, ticker: clean(input.ticker, 240), youtube, videoSound: Boolean(input.videoSound) };
}

/**
 * Pure state transition shared by the browser (single-device mode) and the API route (shared mode).
 * Returns a new state; the input is never mutated.
 */
export function applyAction(previous: QueueState | null | undefined, action: QueueAction, now: number): { state: QueueState; result: ActionResult } {
  const base = ensureDay(previous, now);
  const state = structuredClone(base);
  const result = run(state, action, now);
  return { state: result.ok ? state : base, result };
}

function run(state: QueueState, action: QueueAction, now: number): ActionResult {
  const findVisit = (id: string) => state.visits.find((visit) => visit.id === id && !visit.cancelled);

  switch (action.type) {
    case "arrive": {
      const visit = newVisit(state, action.kind, Boolean(action.priority), Boolean(action.newPatient), now, "desk");
      if (typeof visit === "string") return fail(visit);
      return { ok: true, visitId: visit.id, label: arrivalLabel(visit) };
    }
    case "callRegistration": {
      const waiting = waitingToRegister(state);
      const visit = action.visitId ? waiting.find((item) => item.id === action.visitId) : waiting.find((item) => item.regCalledAt === null);
      if (!visit) return fail(action.visitId ? "That number is not waiting to register." : "Everyone waiting has been called. Use Call on a number to call it again.");
      visit.regCalledAt = now;
      visit.regCalls += 1;
      const label = arrivalLabel(visit);
      announce(state, { at: now, kind: "registration", label, station: "DESK", destination: "the Front Desk for registration" });
      return { ok: true, visitId: visit.id, label };
    }
    case "register": {
      let visit: Visit | string | undefined;
      if (action.visitId) {
        visit = findVisit(action.visitId);
        if (!visit || isRegistered(visit)) return fail("That queue number is no longer waiting to register.");
      } else {
        visit = newVisit(state, action.visit.kind, Boolean(action.visit.priority), Boolean(action.visit.newPatient), now, "desk");
        if (typeof visit === "string") return fail(visit);
      }
      const problem = registerVisit(state, visit, action.visit, now);
      if (problem) return fail(problem);
      return { ok: true, visitId: visit.id, label: currentLabel(visit) };
    }
    case "selfCheckIn": {
      const codes = Array.isArray(action.visit.stations) ? action.visit.stations : [];
      const first = findStation(state, String(codes[0]));
      if (!first?.selfCheckIn) return fail("Choose the doctor or service you are scheduled for.");
      const visit = newVisit(state, "S", Boolean(action.visit.priority), Boolean(action.visit.newPatient), now, "self");
      if (typeof visit === "string") return fail(visit);
      const problem = registerVisit(state, visit, { ...action.visit, kind: "S" }, now);
      if (problem) return fail(problem);
      return { ok: true, visitId: visit.id, label: currentLabel(visit) };
    }
    case "verify": {
      const visit = findVisit(action.visitId);
      if (!visit) return fail("Patient not found.");
      visit.verified = true;
      return { ok: true };
    }
    case "updateVisit": {
      const visit = findVisit(action.visitId);
      if (!visit) return fail("Patient not found.");
      if (action.name !== undefined) {
        const name = clean(action.name, 80);
        if (!name) return fail("Enter the patient's name.");
        visit.name = name;
      }
      if (action.mobile !== undefined) visit.mobile = clean(action.mobile, 20);
      if (action.notes !== undefined) visit.notes = clean(action.notes, 200);
      if (action.priority !== undefined) visit.priority = Boolean(action.priority);
      if (action.newPatient !== undefined) visit.newPatient = Boolean(action.newPatient);
      return { ok: true };
    }
    case "markMessaged": {
      const visit = findVisit(action.visitId);
      if (!visit) return fail("Patient not found.");
      visit.messagedAt = now;
      return { ok: true };
    }
    case "call": {
      const station = findStation(state, action.station);
      if (!station) return fail("Unknown station.");
      let target: Visit | undefined;
      if (action.visitId) {
        target = findVisit(action.visitId);
        const step = target && currentStep(target);
        if (!target || !step || step.station !== station.code || !["waiting", "missed"].includes(step.status)) return fail("That patient is not waiting for this station.");
      } else {
        target = waitingFor(state, station.code)[0];
        if (!target) return fail(`No one is waiting for ${station.name}.`);
      }
      // Calling the next patient completes whoever the station was serving.
      servingAt(state, station.code).forEach((visit) => { if (visit.id !== target!.id) finishStep(visit, now); });
      const step = currentStep(target)!;
      step.status = "called";
      step.calledAt = now;
      step.calls += 1;
      const label = ticketLabel(target, station.code);
      announce(state, { at: now, kind: "ticket", label, station: station.code, destination: station.location || station.name });
      return { ok: true, visitId: target.id, label };
    }
    case "recall": {
      const visit = findVisit(action.visitId);
      const step = visit && currentStep(visit);
      if (!visit || !step || step.status !== "called") return fail("That patient has not been called yet.");
      const station = findStation(state, step.station);
      step.calls += 1;
      step.calledAt = now;
      announce(state, { at: now, kind: "ticket", label: ticketLabel(visit, step.station), station: step.station, destination: station?.location || station?.name || step.station });
      return { ok: true };
    }
    case "complete": {
      const visit = findVisit(action.visitId);
      if (!visit || !currentStep(visit)) return fail("That patient has no open service.");
      if (action.sendTo) {
        const station = findStation(state, action.sendTo);
        if (!station?.active) return fail("Choose an available station to send the patient to.");
        if (visit.steps.length >= MAX_STEPS) return fail(`A visit can have at most ${MAX_STEPS} services.`);
      }
      finishStep(visit, now, action.sendTo);
      const next = currentStep(visit);
      return { ok: true, visitId: visit.id, label: next ? ticketLabel(visit, next.station) : undefined };
    }
    case "miss": {
      const visit = findVisit(action.visitId);
      const step = visit && currentStep(visit);
      if (!step || !["called", "waiting"].includes(step.status)) return fail("That patient is not in line.");
      step.status = "missed";
      return { ok: true };
    }
    case "requeue": {
      const visit = findVisit(action.visitId);
      const step = visit && currentStep(visit);
      if (!step || step.status !== "missed") return fail("Only missed patients can be returned to the line.");
      step.status = "waiting";
      step.queuedAt = now;
      return { ok: true };
    }
    case "cancel": {
      const visit = findVisit(action.visitId);
      if (!visit) return fail("Patient not found.");
      visit.cancelled = true;
      return { ok: true };
    }
    case "updateSettings": {
      const settings = sanitizeSettings(action.settings);
      if (typeof settings === "string") return fail(settings);
      state.settings = settings;
      return { ok: true };
    }
    case "resetDay":
      Object.assign(state, emptyState(now, state.settings));
      return { ok: true };
    default:
      return fail("Unknown action.");
  }
}

/** Removes names, mobile numbers and notes so the TV board and patient phones never receive them. */
export function publicView(state: QueueState): QueueState {
  return { ...state, visits: state.visits.map((visit) => ({ ...visit, name: "", mobile: "", notes: "" })) };
}
