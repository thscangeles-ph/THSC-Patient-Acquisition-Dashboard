"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, CheckCircle2, Clock, FileSpreadsheet, MessageSquareText, Plus, Printer, RotateCcw, Search, Settings2, ShieldCheck, Star, Ticket, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { arrivalLabel, currentLabel, currentStep, isRegistered, ticketLabel, waitingToRegister } from "@/lib/queue/reducer";
import { downloadQueueReport } from "@/lib/queue/report";
import { printSlip } from "@/lib/queue/slip";
import { formatTime, formatWait, minutesSince, queueMessage, STATUS_LABEL, STATUS_TONE, stationName, visitStatus } from "@/lib/queue/format";
import type { ActionResult, PatientKind, QueueAction, QueueState, Visit } from "@/lib/queue/types";
import { Panel, StaffShell } from "./staff-shell";
import { SettingsPanel } from "./settings-panel";
import { useNow, useQueue } from "./use-queue";

type Dispatch = (action: QueueAction) => Promise<ActionResult>;
type Feedback = { tone: "ok" | "error"; text: string } | null;
type Filter = "active" | "completed" | "all";

export function FrontDesk() {
  const queue = useQueue();
  const [showSettings, setShowSettings] = useState(false);
  return (
    <StaffShell queue={queue} active="desk" title="Queue Board · Front Desk"
      actions={<Button variant="outline" size="sm" onClick={() => setShowSettings((value) => !value)} className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><Settings2 size={15} /> {showSettings ? "Close settings" : "Settings"}</Button>}>
      {(state) => <Desk state={state} dispatch={queue.dispatch} shared={queue.mode === "server"} showSettings={showSettings} closeSettings={() => setShowSettings(false)} />}
    </StaffShell>
  );
}

function Desk({ state, dispatch, shared, showSettings, closeSettings }: { state: QueueState; dispatch: Dispatch; shared: boolean; showSettings: boolean; closeSettings: () => void }) {
  const now = useNow();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [prefill, setPrefill] = useState<{ visitId: string; key: number } | null>(null);

  const run = async (action: QueueAction, success?: string) => {
    const result = await dispatch(action);
    setFeedback(result.ok ? (success ? { tone: "ok", text: success } : null) : { tone: "error", text: result.error });
    return result;
  };

  const stats = useMemo(() => {
    const active = state.visits.filter((visit) => !visit.cancelled);
    const waits = active.map((visit) => visit.steps[0]).filter((step) => step?.calledAt && step.queuedAt).map((step) => (step.calledAt! - step.queuedAt!) / 60000);
    return {
      toRegister: active.filter((visit) => visitStatus(visit) === "registration").length,
      waiting: active.filter((visit) => visitStatus(visit) === "waiting").length,
      serving: active.filter((visit) => visitStatus(visit) === "called").length,
      completed: active.filter((visit) => visitStatus(visit) === "completed").length,
      avgWait: waits.length ? Math.round(waits.reduce((sum, value) => sum + value, 0) / waits.length) : null,
      total: active.length,
    };
  }, [state.visits]);

  return (
    <div className="grid gap-5">
      {showSettings && <SettingsPanel state={state} dispatch={dispatch} onClose={closeSettings} />}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat accent icon={<Ticket size={18} />} label="Waiting to register" value={stats.toRegister} detail="Have a queue number, not yet registered" />
        <Stat icon={<Clock size={18} />} label="Waiting at stations" value={stats.waiting} detail={stats.avgWait === null ? "Registered, waiting to be called" : `Average first wait ${stats.avgWait} min`} />
        <Stat icon={<BellRing size={18} />} label="Being served" value={stats.serving} detail="Called to a station" />
        <Stat icon={<CheckCircle2 size={18} />} label="Completed today" value={stats.completed} detail={`${stats.total} queue numbers today`} />
      </section>

      {feedback && (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${feedback.tone === "ok" ? "bg-[#edf5e8] text-[#41612c]" : "bg-[#fde8eb] text-[#9b1f35]"}`}>
          <span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid gap-5">
          <ArrivalPanel state={state} now={now} run={run} onRegister={(visitId) => setPrefill({ visitId, key: Date.now() })} />
          <RegisterForm key={prefill?.key ?? 0} state={state} run={run} shared={shared} initialVisitId={prefill?.visitId ?? null} />
        </div>
        <PatientList state={state} now={now} run={run} shared={shared} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-[#d8a321] bg-[#4a3612] text-white" : "border-[#e2d7c2] bg-[#fffefb]"}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${accent ? "text-[#f0c864]" : "text-[#746957]"}`}>{icon}{label}</div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      <p className={`text-sm ${accent ? "text-[#f4e8c7]" : "text-[#807562]"}`}>{detail}</p>
    </div>
  );
}

const slip = (label: string, issuedAt: number) => printSlip(label, issuedAt, `${window.location.origin}/theheartspecialists.png`);

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-[#2f281c] bg-[#2f281c] text-white" : "border-[#d8c79f] bg-white text-[#4c4436] hover:border-[#d8a321]"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? "border-[#f0c864] bg-[#f0c864] text-[#2f281c]" : "border-[#d8c79f]"}`}>{on && <Check size={13} />}</span>
      <span><span className="block font-semibold">{label}</span><span className={`block text-xs ${on ? "text-[#e8dec7]" : "text-[#756b59]"}`}>{hint}</span></span>
    </button>
  );
}

const NewBadge = () => <span className="ml-2 rounded-full bg-[#e3f0dc] px-2 py-0.5 text-xs font-semibold text-[#36561f]">New</span>;

function ArrivalPanel({ state, now, run, onRegister }: { state: QueueState; now: number | null; run: (action: QueueAction, success?: string) => Promise<ActionResult>; onRegister: (visitId: string) => void }) {
  const [priority, setPriority] = useState(false);
  const [newPatient, setNewPatient] = useState(false);
  const [latest, setLatest] = useState<string | null>(null);
  const [printEach, setPrintEach] = useState(false);
  const waiting = waitingToRegister(state);
  const latestVisit = latest ? state.visits.find((visit) => visit.id === latest) : undefined;

  const generate = async (kind: PatientKind) => {
    const result = await run({ type: "arrive", kind, priority, newPatient });
    if (!result.ok) return;
    setLatest(result.visitId!);
    setPriority(false);
    setNewPatient(false);
    if (printEach) slip(result.label!, Date.now());
  };

  return (
    <Panel title="Step 1 · Queue number on arrival" description="Generate the patient's number as soon as they arrive, before registration."
      actions={<Button size="sm" onClick={() => run({ type: "callRegistration" })} disabled={!waiting.some((visit) => visit.regCalledAt === null)} className="bg-[#2f281c] text-[#f0c864] hover:bg-[#4a3d27]"><BellRing size={15} /> Call next to register</Button>}>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void generate("W")} className="h-12 bg-[#8b6512] text-base text-white hover:bg-[#6f4e0a]"><Ticket size={17} /> Walk-in number</Button>
        <Button onClick={() => void generate("S")} variant="outline" className="h-12 text-base"><Ticket size={17} /> Scheduled number</Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Toggle on={newPatient} onClick={() => setNewPatient((value) => !value)} label="New patient" hint="First visit to THSC" />
        <Toggle on={priority} onClick={() => setPriority((value) => !value)} label="Priority lane" hint="Senior, PWD, pregnant" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
        <label className="flex items-center gap-2 text-[#5e5443]"><input type="checkbox" checked={printEach} onChange={(event) => setPrintEach(event.target.checked)} className="h-4 w-4 accent-[#8b6512]" />Print a slip for each number</label>
      </div>
      {latestVisit && !latestVisit.cancelled && !isRegistered(latestVisit) && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#d8a321] bg-[#2f281c] px-4 py-3 text-white">
          <div><p className="text-xs font-semibold text-[#f0c864]">New queue number — give it to the patient</p><p className="font-mono text-3xl font-extrabold tracking-wide">{arrivalLabel(latestVisit)}</p></div>
          <Button size="sm" variant="secondary" onClick={() => slip(arrivalLabel(latestVisit), latestVisit.createdAt)}><Printer size={15} /> Print slip</Button>
        </div>
      )}
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-[#8b6512]">Waiting to register · {waiting.length}</p>
      <ul className="scrollbar-thin -mr-2 mt-2 grid max-h-[340px] gap-2 overflow-y-auto pr-2">
        {waiting.length === 0 && <li className="rounded-xl border border-dashed border-[#d8c8a6] px-4 py-5 text-center text-sm text-[#857967]">No one is waiting to register.</li>}
        {waiting.map((visit) => (
          <li key={visit.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${visit.regCalledAt ? "border-[#d8a321] bg-[#fff9e9]" : "border-[#e8dfce]"}`}>
            <span className="min-w-[64px] rounded-lg bg-[#2f281c] px-2 py-1.5 text-center font-mono text-lg font-extrabold text-[#f0c864]">{arrivalLabel(visit)}</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{visit.regCalledAt ? `Called${visit.regCalls > 1 ? ` ×${visit.regCalls}` : ""}` : "Waiting"}{visit.newPatient && <NewBadge />}{visit.priority && <span className="ml-2 rounded-full bg-[#fff0bd] px-2 py-0.5 text-xs text-[#5f4307]">Priority</span>}</p>
              <p className="text-[#7d725f]">Arrived {formatTime(visit.createdAt)} · {formatWait(minutesSince(visit.createdAt, now))}</p>
            </div>
            <Button size="icon-sm" variant="outline" title="Call to register" aria-label={`Call ${arrivalLabel(visit)} to register`} onClick={() => run({ type: "callRegistration", visitId: visit.id })}><BellRing size={15} /></Button>
            <Button size="sm" onClick={() => onRegister(visit.id)} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]">Register</Button>
            <Button size="icon-sm" variant="ghost" title="Remove number" aria-label={`Remove ${arrivalLabel(visit)}`} onClick={() => { if (window.confirm(`Remove ${arrivalLabel(visit)}? Use this if the patient left before registering.`)) void run({ type: "cancel", visitId: visit.id }); }}><X size={15} /></Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RegisterForm({ state, run, shared, initialVisitId }: { state: QueueState; run: (action: QueueAction, success?: string) => Promise<ActionResult>; shared: boolean; initialVisitId: string | null }) {
  const initial = initialVisitId ? state.visits.find((visit) => visit.id === initialVisitId) : undefined;
  const [arrivalId, setArrivalId] = useState<string | null>(initial?.id ?? null);
  const [kind, setKind] = useState<PatientKind>(initial?.kind ?? "W");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(initial?.priority ?? false);
  const [newPatient, setNewPatient] = useState(initial?.newPatient ?? false);
  const [stations, setStations] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ visitId: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const available = state.settings.stations.filter((station) => station.active);
  const issuedVisit = issued ? state.visits.find((visit) => visit.id === issued.visitId) : undefined;
  const waiting = waitingToRegister(state);
  const arrival = arrivalId ? waiting.find((visit) => visit.id === arrivalId) : undefined;
  const previewSeq = arrival?.seq ?? state.nextSeq;
  const chooseArrival = (id: string | null) => {
    setArrivalId(id);
    const visit = id ? waiting.find((item) => item.id === id) : undefined;
    if (visit) { setKind(visit.kind); setPriority(visit.priority); setNewPatient(visit.newPatient === true); }
  };

  const submit = async () => {
    setBusy(true);
    const result = await run({ type: "register", visitId: arrival?.id, visit: { kind, name, mobile, notes, priority, newPatient, stations } });
    setBusy(false);
    if (!result.ok) return;
    setIssued({ visitId: result.visitId!, label: result.label! });
    setName(""); setMobile(""); setNotes(""); setPriority(false); setStations([]); setArrivalId(null); setKind("W"); setNewPatient(false);
  };

  return (
    <Panel title="Step 2 · Register to the Queue Board" description="Also register the patient in the Lab Info System as usual.">
      {issued && (
        <div className="mb-5 rounded-xl border border-[#d8a321] bg-[#2f281c] p-4 text-white">
          <p className="text-sm font-semibold text-[#f0c864]">Queue number issued — tell the patient</p>
          <p className="mt-1 font-mono text-4xl font-extrabold tracking-wide">{issued.label}</p>
          <p className="mt-1 text-sm text-[#e8dec7]">They keep the same number ({issued.label.slice(0, 2)}) for every service today.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {issuedVisit && <MessageButton state={state} visit={issuedVisit} run={run} shared={shared} dark />}
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)} className="text-[#e8dec7] hover:bg-[#4a3d27] hover:text-white">Done</Button>
          </div>
        </div>
      )}
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f2ecdf] p-1" role="radiogroup" aria-label="Patient type">
          {([["W", "Walk-in (W)"], ["S", "Scheduled (S)"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${kind === value ? "bg-white text-[#2f281c] shadow-sm" : "text-[#756b59]"}`}>{label}</button>
          ))}
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Queue number
          <select value={arrival?.id ?? ""} onChange={(event) => chooseArrival(event.target.value || null)} className="h-[42px] rounded-md border border-[#d8c79f] bg-white px-3 text-base font-normal">
            <option value="">New number ({String(state.nextSeq).padStart(2, "0")}) — patient has no number yet</option>
            {waiting.map((visit) => <option key={visit.id} value={visit.id}>{arrivalLabel(visit)} · arrived {formatTime(visit.createdAt)}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Patient name<Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" autoComplete="off" className="text-base font-normal" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Mobile number <span className="-mt-1 text-xs font-normal text-[#857967]">Optional — for the one-time queue message</span><Input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09XX XXX XXXX" autoComplete="off" className="text-base font-normal" /></label>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-[#514838]">Services today, in order</legend>
          {stations.length > 0 && (
            <ol className="grid gap-1.5">
              {stations.map((code, index) => (
                <li key={`${code}-${index}`} className="flex items-center gap-2 rounded-lg border border-[#e8dfce] bg-[#faf7f0] px-3 py-1.5 text-sm">
                  <span className="font-mono font-bold text-[#8b6512]">{index + 1}.</span>
                  <span className="font-mono font-semibold">{ticketLabel({ seq: previewSeq, kind }, code)}</span>
                  <span className="flex-1 truncate text-[#5e5443]">{stationName(state, code)}</span>
                  <button type="button" aria-label={`Remove ${stationName(state, code)}`} onClick={() => setStations((current) => current.filter((_, position) => position !== index))} className="text-[#857967] hover:text-[#b4233c]"><X size={15} /></button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-1.5">
            {available.map((station) => (
              <button key={station.code} type="button" onClick={() => setStations((current) => [...current, station.code])} className="inline-flex items-center gap-1 rounded-full border border-[#d8c79f] bg-white px-3 py-1.5 text-sm font-semibold text-[#4c4436] hover:border-[#d8a321] hover:bg-[#fff9e9]">
                <Plus size={13} /><span className="font-mono">{station.code}</span><span className="font-normal text-[#756b59]">{station.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Toggle on={newPatient} onClick={() => setNewPatient((value) => !value)} label="New patient" hint="First visit to THSC" />
          <Toggle on={priority} onClick={() => setPriority((value) => !value)} label="Priority lane" hint="Senior, PWD, pregnant" />
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Notes for staff<Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" className="text-base font-normal" /></label>
        <Button type="submit" disabled={busy || !name.trim() || !stations.length} className="h-11 bg-[#8b6512] text-base text-white hover:bg-[#6f4e0a]"><Ticket size={17} /> Issue queue number</Button>
      </form>
    </Panel>
  );
}

function MessageButton({ state, visit, run, shared, dark = false }: { state: QueueState; visit: Visit; run: (action: QueueAction, success?: string) => Promise<ActionResult>; shared: boolean; dark?: boolean }) {
  const copy = async () => {
    const tracking = shared ? `${window.location.origin}/queue/ticket?id=${visit.id}` : undefined;
    const text = queueMessage(state, visit, tracking);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this message:", text);
    }
    await run({ type: "markMessaged", visitId: visit.id }, `Message for ${currentLabel(visit)} copied. Paste it into SMS or Viber${visit.mobile ? ` for ${visit.mobile}` : ""}.`);
  };
  const sent = Boolean(visit.messagedAt);
  return (
    <Button size="sm" variant={dark ? "secondary" : "outline"} onClick={() => void copy()} title={sent ? `Message copied at ${formatTime(visit.messagedAt!)}` : "Copy the one-time queue message"}>
      {sent ? <Check size={15} /> : <MessageSquareText size={15} />}{sent ? "Message sent" : "Copy message"}
    </Button>
  );
}

function PatientList({ state, now, run, shared }: { state: QueueState; now: number | null; run: (action: QueueAction, success?: string) => Promise<ActionResult>; shared: boolean }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const term = search.trim().toUpperCase();
  const visits = state.visits.filter((visit) => {
    const status = visitStatus(visit);
    if (filter === "active" && (status === "completed" || status === "cancelled")) return false;
    if (filter === "completed" && status !== "completed") return false;
    if (!term) return true;
    return visit.name.toUpperCase().includes(term) || currentLabel(visit).includes(term) || visit.mobile.includes(term);
  });
  const toVerify = state.visits.filter((visit) => !visit.verified && !visit.cancelled).length;

  return (
    <Panel title="Today's patients" description={toVerify ? `${toVerify} QR self check-in${toVerify > 1 ? "s" : ""} to verify at the desk.` : "Every queue number today and where the patient is now."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b6512]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or number" aria-label="Search patients" className="h-9 w-48 pl-8" /></div>
          <Button size="sm" variant="outline" onClick={() => void import("xlsx").then((xlsx) => downloadQueueReport(xlsx, state, Date.now()))} disabled={!state.visits.length}><FileSpreadsheet size={15} /> Excel report</Button>
          <div className="flex rounded-lg bg-[#f2ecdf] p-1 text-sm font-semibold">
            {(["active", "completed", "all"] as Filter[]).map((value) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-3 py-1 ${filter === value ? "bg-white shadow-sm" : "text-[#756b59]"}`}>{value === "active" ? "In clinic" : value === "completed" ? "Completed" : "All"}</button>
            ))}
          </div>
        </div>
      }>
      <div className="-m-5 overflow-x-auto">
        <Table>
          <TableHeader className="bg-[#faf5e9]"><TableRow><TableHead className="pl-5">Queue no.</TableHead><TableHead>Patient</TableHead><TableHead>Status</TableHead><TableHead>Waiting</TableHead><TableHead>Route</TableHead><TableHead className="pr-5 text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {visits.length === 0 && <TableRow><TableCell colSpan={6} className="h-40 text-center text-[#7d725f]">{state.visits.length ? "No patients match this view." : "Registered patients will appear here."}</TableCell></TableRow>}
            {visits.map((visit) => {
              const status = visitStatus(visit);
              const step = currentStep(visit);
              const since = step?.status === "called" ? step.calledAt : step?.queuedAt ?? null;
              return (
                <TableRow key={visit.id} className={visit.cancelled ? "opacity-60" : ""}>
                  <TableCell className="pl-5"><span className="font-mono text-base font-extrabold">{currentLabel(visit)}</span><span className="block text-xs text-[#857967]">Arrived {formatTime(visit.createdAt)}</span></TableCell>
                  <TableCell className="max-w-[240px]">
                    <p className="truncate font-semibold">{visit.name || <span className="font-normal italic text-[#857967]">Not registered yet</span>}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
                      {visit.newPatient && <span className="rounded-full bg-[#e3f0dc] px-2 py-0.5 font-semibold text-[#36561f]">New patient</span>}
                      {visit.priority && <span className="rounded-full bg-[#fff0bd] px-2 py-0.5 font-semibold text-[#5f4307]">Priority</span>}
                      {visit.source === "self" && <span className={`rounded-full px-2 py-0.5 font-semibold ${visit.verified ? "bg-[#edf5e8] text-[#41612c]" : "bg-[#fde8eb] text-[#9b1f35]"}`}>{visit.verified ? "QR check-in" : "QR check-in · verify"}</span>}
                      {visit.mobile && <span className="text-[#857967]">{visit.mobile}</span>}
                      {visit.notes && <span className="text-[#857967]">· {visit.notes}</span>}
                    </div>
                  </TableCell>
                  <TableCell><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>{step && status !== "completed" && <span className="mt-0.5 block text-xs text-[#756b59]">{stationName(state, step.station)}</span>}</TableCell>
                  <TableCell className="tabular-nums text-sm">{status === "waiting" || status === "called" ? formatWait(minutesSince(since, now)) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {visit.steps.map((item) => <span key={item.id} title={`${stationName(state, item.station)} · ${item.status}`} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${item.status === "done" ? "bg-[#edf5e8] text-[#41612c]" : item === step ? "bg-[#2f281c] text-[#f0c864]" : "bg-[#f2ecdf] text-[#756b59]"}`}>{item.status === "done" && <Check size={11} />}{item.station}</span>)}
                    </div>
                  </TableCell>
                  <TableCell className="pr-5">
                    {!visit.cancelled && (
                      <div className="flex justify-end gap-1.5">
                        {!visit.verified && <Button size="sm" variant="outline" onClick={() => run({ type: "verify", visitId: visit.id })}><UserCheck size={15} /> Verify</Button>}
                        {status === "missed" && <Button size="sm" variant="outline" onClick={() => run({ type: "requeue", visitId: visit.id }, `${currentLabel(visit)} is back in line.`)}><RotateCcw size={15} /> Return to line</Button>}
                        {status !== "completed" && status !== "registration" && <MessageButton state={state} visit={visit} run={run} shared={shared} />}
                        <Button size="icon-sm" variant="ghost" title={visit.priority ? "Remove priority" : "Mark as priority"} aria-label={visit.priority ? "Remove priority" : "Mark as priority"} onClick={() => run({ type: "updateVisit", visitId: visit.id, priority: !visit.priority })}><Star size={15} className={visit.priority ? "fill-[#d8a321] text-[#d8a321]" : ""} /></Button>
                        {status !== "completed" && <Button size="icon-sm" variant="ghost" title="Cancel visit" aria-label="Cancel visit" onClick={() => { if (window.confirm(`Cancel ${currentLabel(visit)}${visit.name ? ` (${visit.name})` : ""}?`)) void run({ type: "cancel", visitId: visit.id }); }}><X size={15} /></Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-8 flex items-center gap-2 text-xs text-[#857967]"><ShieldCheck size={14} /> Names and mobile numbers appear only on staff screens. The TV and patient phones show queue numbers only.</p>
    </Panel>
  );
}
