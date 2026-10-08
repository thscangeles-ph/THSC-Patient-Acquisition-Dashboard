export type PatientKind = "W" | "S";
export type ServiceType = "consultation" | "procedure" | "laboratory" | "other";
export type StepStatus = "pending" | "waiting" | "called" | "done" | "missed";

export type Station = {
  /** Short code used inside the queue number, e.g. C1 in 01-C1-W. */
  code: string;
  name: string;
  service: ServiceType;
  /** Where the patient should go when called, read out on the TV. */
  location: string;
  /** Scheduled patients may choose this station on the QR self check-in page. */
  selfCheckIn: boolean;
  active: boolean;
};

export type Step = {
  id: string;
  station: string;
  status: StepStatus;
  queuedAt: number | null;
  calledAt: number | null;
  doneAt: number | null;
  calls: number;
};

export type Visit = {
  id: string;
  /** Daily sequence number shared by every service of the visit (the 01 in 01-C1-W). */
  seq: number;
  kind: PatientKind;
  name: string;
  mobile: string;
  notes: string;
  priority: boolean;
  source: "desk" | "self";
  verified: boolean;
  cancelled: boolean;
  card: number | null;
  createdAt: number;
  /** When the one-time queue message was sent to the patient. */
  messagedAt: number | null;
  steps: Step[];
};

export type Card = { number: number; issuedAt: number; calledAt: number | null; calls: number };

export type Announcement = {
  id: string;
  at: number;
  kind: "ticket" | "card";
  label: string;
  /** Station code for tickets, or "DESK" for registration cards. */
  station: string;
  destination: string;
};

export type Settings = {
  stations: Station[];
  cardCount: number;
  ticker: string;
};

export type QueueState = {
  day: string;
  nextSeq: number;
  visits: Visit[];
  cards: Card[];
  announcements: Announcement[];
  settings: Settings;
};

export type VisitInput = {
  kind: PatientKind;
  name: string;
  mobile?: string;
  notes?: string;
  priority?: boolean;
  stations: string[];
  card?: number | null;
};

export type QueueAction =
  | { type: "issueCard"; card?: number }
  | { type: "callCard"; card?: number }
  | { type: "removeCard"; card: number }
  | { type: "register"; visit: VisitInput }
  | { type: "selfCheckIn"; visit: Omit<VisitInput, "kind" | "card" | "priority"> & { priority?: boolean } }
  | { type: "verify"; visitId: string }
  | { type: "updateVisit"; visitId: string; name?: string; mobile?: string; notes?: string; priority?: boolean }
  | { type: "markMessaged"; visitId: string }
  | { type: "call"; station: string; visitId?: string }
  | { type: "recall"; visitId: string }
  | { type: "complete"; visitId: string; sendTo?: string }
  | { type: "miss"; visitId: string }
  | { type: "requeue"; visitId: string }
  | { type: "cancel"; visitId: string }
  | { type: "updateSettings"; settings: Settings }
  | { type: "resetDay" };

export type ActionResult = { ok: true; visitId?: string; label?: string; card?: number } | { ok: false; error: string };

export const PUBLIC_ACTIONS: QueueAction["type"][] = ["selfCheckIn"];
