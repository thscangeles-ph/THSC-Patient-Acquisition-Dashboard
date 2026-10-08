import type * as SheetJS from "xlsx";
import { currentLabel, isRegistered, TIME_ZONE } from "./reducer";
import { formatTime, STATUS_LABEL, stationName, visitStatus } from "./format";
import type { QueueState, Visit } from "./types";

type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][]; widths: number[] };

const longDate = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const hourOf = (timestamp: number) => Number(new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date(timestamp)));
const hourLabel = (hour: number) => `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
const minutes = (from: number | null | undefined, to: number | null | undefined) => (from && to && to >= from ? Math.round((to - from) / 60000) : null);
const time = (timestamp: number | null | undefined) => (timestamp ? formatTime(timestamp) : "");
const average = (values: (number | null)[]) => { const list = values.filter((v): v is number => v !== null); return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null; };
const longest = (values: (number | null)[]) => { const list = values.filter((v): v is number => v !== null); return list.length ? Math.max(...list) : null; };

function finishedAt(visit: Visit) {
  return visitStatus(visit) === "completed" ? Math.max(...visit.steps.map((step) => step.doneAt ?? 0)) || null : null;
}

/** The day's queue as report sheets: Summary, By station, By hour and Patient list. */
export function buildQueueReport(state: QueueState, now: number): Sheet[] {
  const visits = [...state.visits].sort((a, b) => a.seq - b.seq);
  const active = visits.filter((visit) => !visit.cancelled);
  const count = (list: Visit[], test: (visit: Visit) => boolean) => list.filter(test).length;
  const toRegister = visits.map((visit) => (visit.source === "desk" ? minutes(visit.createdAt, visit.registeredAt) : null));
  const toFirstCall = visits.map((visit) => minutes(visit.steps[0]?.queuedAt, visit.steps[0]?.calledAt));
  const inClinic = visits.map((visit) => minutes(visit.createdAt, finishedAt(visit)));

  const arrivalsByHour = new Map<number, Visit[]>();
  visits.forEach((visit) => { const hour = hourOf(visit.createdAt); arrivalsByHour.set(hour, [...(arrivalsByHour.get(hour) ?? []), visit]); });
  const hours = [...arrivalsByHour.keys()].sort((a, b) => a - b);
  const busiest = hours.reduce<number | null>((best, hour) => (best === null || arrivalsByHour.get(hour)!.length > arrivalsByHour.get(best)!.length ? hour : best), null);

  const summary: Cell[][] = [
    ["The Heart Specialists Clinic — Queue Summary Report"],
    ["Date", longDate.format(now)],
    ["Generated", formatTime(now)],
    [],
    ["PATIENT FLOW", "Count"],
    ["Queue numbers issued", visits.length],
    ["Registered", count(visits, (v) => isRegistered(v))],
    ["Completed", count(active, (v) => visitStatus(v) === "completed")],
    ["Still in clinic", count(active, (v) => !["completed", "cancelled"].includes(visitStatus(v)))],
    ["Missed call (not yet back in line)", count(active, (v) => visitStatus(v) === "missed")],
    ["Left before registration", count(visits, (v) => v.cancelled && !isRegistered(v))],
    ["Cancelled after registration", count(visits, (v) => v.cancelled && isRegistered(v))],
    [],
    ["PATIENT MIX (excluding cancelled)", "Count"],
    ["Walk-in (W)", count(active, (v) => v.kind === "W")],
    ["Scheduled (S)", count(active, (v) => v.kind === "S")],
    ["New patients", count(active, (v) => v.newPatient === true)],
    ["Returning patients", count(active, (v) => v.newPatient !== true)],
    ["Priority lane", count(active, (v) => v.priority)],
    ["QR self check-in", count(active, (v) => v.source === "self")],
    [],
    ["WAITING TIMES (minutes)", "Average", "Longest"],
    ["Arrival → registration", average(toRegister), longest(toRegister)],
    ["Registration → first call", average(toFirstCall), longest(toFirstCall)],
    ["Total time in clinic (completed visits)", average(inClinic), longest(inClinic)],
    [],
    ["Busiest hour", busiest === null ? "—" : `${hourLabel(busiest)} – ${hourLabel((busiest + 1) % 24)}`, busiest === null ? null : arrivalsByHour.get(busiest)!.length],
  ];

  const stationRows: Cell[][] = [["Code", "Station", "Service", "Patients queued", "Served", "Waiting now", "Missed", "Avg wait (min)", "Longest wait (min)", "Avg service time (min)"]];
  state.settings.stations.forEach((station) => {
    const steps = active.flatMap((visit) => visit.steps.filter((step) => step.station === station.code && step.status !== "pending"));
    if (!steps.length && !station.active) return;
    const waits = steps.map((step) => minutes(step.queuedAt, step.calledAt));
    stationRows.push([
      station.code, station.name, station.service[0].toUpperCase() + station.service.slice(1), steps.length,
      steps.filter((step) => step.status === "done").length, steps.filter((step) => step.status === "waiting").length, steps.filter((step) => step.status === "missed").length,
      average(waits), longest(waits), average(steps.map((step) => minutes(step.calledAt, step.doneAt))),
    ]);
  });

  const hourRows: Cell[][] = [["Hour", "Queue numbers issued", "Walk-in", "Scheduled", "New patients", "Priority lane"]];
  hours.forEach((hour) => {
    const list = arrivalsByHour.get(hour)!;
    hourRows.push([`${hourLabel(hour)} – ${hourLabel((hour + 1) % 24)}`, list.length, count(list, (v) => v.kind === "W"), count(list, (v) => v.kind === "S"), count(list, (v) => v.newPatient === true), count(list, (v) => v.priority)]);
  });
  if (hours.length) hourRows.push(["Total", visits.length, count(visits, (v) => v.kind === "W"), count(visits, (v) => v.kind === "S"), count(visits, (v) => v.newPatient === true), count(visits, (v) => v.priority)]);

  const patientRows: Cell[][] = [["Queue no.", "Patient", "Mobile", "Type", "New patient", "Priority", "Source", "Status", "Services", "Arrived", "Registered", "First called", "Finished", "Wait to register (min)", "Wait for first call (min)", "Time in clinic (min)", "Notes"]];
  visits.forEach((visit, index) => {
    patientRows.push([
      currentLabel(visit), visit.name, visit.mobile, visit.kind === "S" ? "Scheduled" : "Walk-in", visit.newPatient ? "Yes" : "No", visit.priority ? "Yes" : "",
      visit.source === "self" ? "QR check-in" : "Front desk", STATUS_LABEL[visitStatus(visit)], visit.steps.map((step) => stationName(state, step.station)).join(" → "),
      time(visit.createdAt), time(visit.registeredAt), time(visit.steps[0]?.calledAt), time(finishedAt(visit)),
      toRegister[index], toFirstCall[index], inClinic[index], visit.notes,
    ]);
  });

  return [
    { name: "Summary", rows: summary, widths: [40, 30, 12] },
    { name: "By station", rows: stationRows, widths: [8, 28, 14, 16, 10, 13, 9, 15, 18, 22] },
    { name: "By hour", rows: hourRows, widths: [22, 22, 10, 11, 14, 13] },
    { name: "Patient list", rows: patientRows, widths: [11, 26, 15, 11, 12, 9, 13, 14, 40, 10, 11, 12, 10, 20, 22, 19, 30] },
  ];
}

/** Builds the workbook and downloads it as THSC-Queue-Report-YYYY-MM-DD.xlsx. */
export function downloadQueueReport(xlsx: typeof SheetJS, state: QueueState, now: number) {
  const book = xlsx.utils.book_new();
  buildQueueReport(state, now).forEach((sheet) => {
    const ws = xlsx.utils.aoa_to_sheet(sheet.rows.map((row) => row.map((cell) => (cell === null ? "" : cell))));
    ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    xlsx.utils.book_append_sheet(book, ws, sheet.name);
  });
  xlsx.writeFile(book, `THSC-Queue-Report-${state.day}.xlsx`);
}
