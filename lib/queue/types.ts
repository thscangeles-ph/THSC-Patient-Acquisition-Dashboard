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
  /** False while the patient has a queue number but is still waiting to be registered at the front desk. */
  registered: boolean;
  /** When the front desk last called this number to register, and how many times. */
  regCalledAt: number | null;
  regCalls: number;
  /** When the queue number was generated (on arrival). */
  createdAt: number;
  registeredAt: number | null;
  /** When the one-time queue message was sent to the patient. */
  messagedAt: number | null;
  steps: Step[];
};

export type Announcement = {
  id: string;
  at: number;
  kind: "ticket" | "registration";
  label: string;
  /** Station code for tickets, or "DESK" for registration calls. */
  station: string;
  destination: string;
};

export type Settings = {
  stations: Station[];
  ticker: string;
};

export type QueueState = {
  day: string;
  nextSeq: number;
  visits: Visit[];
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
};

export type QueueAction =
  /** Generates the next queue number for a patient who has just arrived, before registration. */
  | { type: "arrive"; kind: PatientKind; priority?: boolean }
  /** Calls a queue number (the next one if none is given) to the front desk for registration. */
  | { type: "callRegistration"; visitId?: string }
  /** Registers a patient: completes a number generated on arrival (visitId), or creates a new one. */
  | { type: "register"; visit: VisitInput; visitId?: string }
  | { type: "selfCheckIn"; visit: Omit<VisitInput, "kind" | "priority"> & { priority?: boolean } }
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

export type ActionResult = { ok: true; visitId?: string; label?: string } | { ok: false; error: string };

export const PUBLIC_ACTIONS: QueueAction["type"][] = ["selfCheckIn"];
