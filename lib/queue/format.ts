import { currentLabel, currentStep, findStation, isRegistered, TIME_ZONE, waitingFor } from "./reducer";
import type { QueueState, Visit } from "./types";

export type VisitStatus = "registration" | "waiting" | "called" | "missed" | "completed" | "cancelled" | "pending";

export function visitStatus(visit: Visit): VisitStatus {
  if (visit.cancelled) return "cancelled";
  if (!isRegistered(visit)) return "registration";
  const step = currentStep(visit);
  if (!step) return "completed";
  return step.status === "done" ? "completed" : step.status;
}

export const STATUS_LABEL: Record<VisitStatus, string> = {
  registration: "To register",
  waiting: "Waiting",
  called: "Now serving",
  missed: "Missed call",
  completed: "Completed",
  cancelled: "Cancelled",
  pending: "Pending",
};

export const STATUS_TONE: Record<VisitStatus, string> = {
  registration: "bg-[#e8eef7] text-[#2d4a6e]",
  waiting: "bg-[#fff2c8] text-[#6f4e0a]",
  called: "bg-[#2f281c] text-[#f0c864]",
  missed: "bg-[#fde8eb] text-[#9b1f35]",
  completed: "bg-[#edf5e8] text-[#41612c]",
  cancelled: "bg-[#efebe4] text-[#7d725f]",
  pending: "bg-[#efebe4] text-[#7d725f]",
};

export const stationName = (state: QueueState, code: string) => findStation(state, code)?.name ?? code;

const timeFormat = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
export const formatTime = (timestamp: number) => timeFormat.format(new Date(timestamp));

export function minutesSince(timestamp: number | null, now: number | null) {
  if (!timestamp || !now) return 0;
  return Math.max(0, Math.floor((now - timestamp) / 60000));
}

export const formatWait = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

/** How many patients will be called before this one at their current station. */
export function patientsAhead(state: QueueState, visit: Visit) {
  const step = currentStep(visit);
  if (!step || step.status !== "waiting") return 0;
  return waitingFor(state, step.station).findIndex((item) => item.id === visit.id);
}

/** Text for the one-time queue message sent to the patient (SMS or Viber). */
export function queueMessage(state: QueueState, visit: Visit, trackingUrl?: string) {
  const step = currentStep(visit);
  const firstName = visit.name.split(" ")[0] || "there";
  const service = step ? stationName(state, step.station) : "your visit";
  const lines = [
    `The Heart Specialists Clinic: Hi ${firstName}, your queue number today is ${currentLabel(visit)} for ${service}.`,
    "Please stay in the lobby and watch the TV screen for your number. Keep this same number for your consultation, procedures and laboratory tests.",
  ];
  if (trackingUrl) lines.push(`Live status: ${trackingUrl}`);
  return lines.join(" ");
}

/** Reads a queue number aloud in a way TTS voices pronounce clearly, e.g. "zero 1, C 1, W". */
export function spokenLabel(label: string) {
  return label
    .split("-")
    .map((part) => part.split("").join(" "))
    .join(", ");
}
