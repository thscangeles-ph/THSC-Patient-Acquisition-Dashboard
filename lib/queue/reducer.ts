import type { ActionResult, Announcement, QueueAction, QueueState, Settings, Station, Step, Visit, VisitInput } from "./types";

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
  cardCount: 30,
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
  return { day: clinicDay(now), nextSeq: 1, visits: [], cards: [], announcements: [], settings: structuredClone(settings) };
}

/** Queues reset at midnight Manila time; settings carry over. */
export function ensureDay(state: QueueState | null | undefined, now: number): QueueState {
  if (!state) return emptyState(now);
  return state.day === clinicDay(now) ? state : emptyState(now, state.settings);
}

export const ticketLabel = (visit: Pick<Visit, "seq" | "kind">, station: string) => `${String(visit.seq).padStart(2, "0")}-${station}-${visit.kind}`;

export function currentStep(visit: Visit): Step | null {
  return visit.steps.find((step) => step.status !== "done") ?? null;
}

export function currentLabel(visit: Visit) {
  const step = currentStep(visit) ?? visit.steps[visit.steps.length - 1];
  return step ? ticketLabel(visit, step.station) : String(visit.seq).padStart(2, "0");
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

function createVisit(state: QueueState, input: VisitInput, now: number, source: Visit["source"]): { visit: Visit } | { error: string } {
  if (state.visits.length >= 999) return { error: "The daily queue limit of 999 patients has been reached." };
  const name = clean(input.name, 80);
  if (!name) return { error: "Enter the patient's name." };
  const stations = validateStations(state, input.stations);
  if (typeof stations === "string") return { error: stations };
  const visit: Visit = {
    id: newId(),
    seq: state.nextSeq,
    kind: input.kind === "S" ? "S" : "W",
    name,
    mobile: clean(input.mobile, 20),
    notes: clean(input.notes, 200),
    priority: Boolean(input.priority),
    source,
    verified: source === "desk",
    cancelled: false,
    card: typeof input.card === "number" ? input.card : null,
    createdAt: now,
    messagedAt: null,
    steps: stations.map((code, index) => makeStep(code, now, index === 0)),
  };
  state.nextSeq += 1;
  state.visits.push(visit);
  return { visit };
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
  const cardCount = Math.round(Number(input.cardCount));
  if (!Number.isFinite(cardCount) || cardCount < 1 || cardCount > 300) return "Laminated cards must be between 1 and 300.";
  return { stations, cardCount, ticker: clean(input.ticker, 240) };
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
    case "issueCard": {
      const used = new Set(state.cards.map((card) => card.number));
      let number = action.card;
      if (number !== undefined) {
        if (!Number.isInteger(number) || number < 1 || number > state.settings.cardCount) return fail(`Card numbers run from 1 to ${state.settings.cardCount}.`);
        if (used.has(number)) return fail(`Card ${number} is already with a patient.`);
      } else {
        number = Array.from({ length: state.settings.cardCount }, (_, index) => index + 1).find((value) => !used.has(value));
        if (number === undefined) return fail("All laminated cards are in use.");
      }
      state.cards.push({ number, issuedAt: now, calledAt: null, calls: 0 });
      return { ok: true, card: number };
    }
    case "callCard": {
      const card = action.card !== undefined
        ? state.cards.find((item) => item.number === action.card)
        : [...state.cards].sort((a, b) => a.issuedAt - b.issuedAt).find((item) => item.calledAt === null);
      if (!card) return fail(action.card !== undefined ? `Card ${action.card} is not in the registration line.` : "No cards are waiting to be called.");
      card.calledAt = now;
      card.calls += 1;
      announce(state, { at: now, kind: "card", label: `Card ${card.number}`, station: "DESK", destination: "Front Desk" });
      return { ok: true, card: card.number };
    }
    case "removeCard": {
      state.cards = state.cards.filter((card) => card.number !== action.card);
      return { ok: true };
    }
    case "register": {
      const created = createVisit(state, action.visit, now, "desk");
      if ("error" in created) return fail(created.error);
      if (created.visit.card !== null) state.cards = state.cards.filter((card) => card.number !== created.visit.card);
      return { ok: true, visitId: created.visit.id, label: currentLabel(created.visit) };
    }
    case "selfCheckIn": {
      const codes = Array.isArray(action.visit.stations) ? action.visit.stations : [];
      const first = findStation(state, String(codes[0]));
      if (!first?.selfCheckIn) return fail("Choose the doctor or service you are scheduled for.");
      const created = createVisit(state, { ...action.visit, kind: "S", card: null }, now, "self");
      if ("error" in created) return fail(created.error);
      return { ok: true, visitId: created.visit.id, label: currentLabel(created.visit) };
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
