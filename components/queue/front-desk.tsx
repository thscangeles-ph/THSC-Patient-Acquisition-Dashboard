"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, CheckCircle2, Clock, IdCard, MessageSquareText, Plus, RotateCcw, Search, Settings2, ShieldCheck, Star, Ticket, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { currentLabel, currentStep, ticketLabel } from "@/lib/queue/reducer";
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
  const [prefillCard, setPrefillCard] = useState<{ card: number; key: number } | null>(null);

  const run = async (action: QueueAction, success?: string) => {
    const result = await dispatch(action);
    setFeedback(result.ok ? (success ? { tone: "ok", text: success } : null) : { tone: "error", text: result.error });
    return result;
  };

  const stats = useMemo(() => {
    const active = state.visits.filter((visit) => !visit.cancelled);
    const waits = active.map((visit) => visit.steps[0]).filter((step) => step.calledAt && step.queuedAt).map((step) => (step.calledAt! - step.queuedAt!) / 60000);
    return {
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
        <Stat icon={<Clock size={18} />} label="Waiting now" value={stats.waiting} detail="Across all stations" />
        <Stat icon={<BellRing size={18} />} label="Being served" value={stats.serving} detail="Called to a station" />
        <Stat icon={<CheckCircle2 size={18} />} label="Completed today" value={stats.completed} detail={`${stats.total} patients registered`} />
        <Stat accent icon={<Ticket size={18} />} label="Average first wait" value={stats.avgWait === null ? "—" : `${stats.avgWait} min`} detail="Registration to first call" />
      </section>

      {feedback && (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${feedback.tone === "ok" ? "bg-[#edf5e8] text-[#41612c]" : "bg-[#fde8eb] text-[#9b1f35]"}`}>
          <span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid gap-5">
          <RegistrationLine state={state} now={now} run={run} onRegister={(card) => setPrefillCard({ card, key: Date.now() })} />
          <RegisterForm key={prefillCard?.key ?? 0} state={state} run={run} shared={shared} initialCard={prefillCard?.card ?? null} />
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

function RegistrationLine({ state, now, run, onRegister }: { state: QueueState; now: number | null; run: (action: QueueAction, success?: string) => Promise<ActionResult>; onRegister: (card: number) => void }) {
  const [cardNumber, setCardNumber] = useState("");
  const cards = [...state.cards].sort((a, b) => a.issuedAt - b.issuedAt);
  const issue = async () => {
    const wanted = cardNumber.trim() ? Number(cardNumber) : undefined;
    const result = await run({ type: "issueCard", card: wanted });
    if (result.ok) setCardNumber("");
  };
  return (
    <Panel title="Step 1 · Registration line" description="Walk-in patients receive a laminated number while they wait to register."
      actions={<Button size="sm" onClick={() => run({ type: "callCard" })} disabled={!cards.some((card) => card.calledAt === null)} className="bg-[#2f281c] text-[#f0c864] hover:bg-[#4a3d27]"><BellRing size={15} /> Call next card</Button>}>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void issue(); }}>
        <Input type="number" min={1} max={state.settings.cardCount} value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} placeholder="Auto" aria-label="Laminated card number" className="w-24 text-base" />
        <Button type="submit" className="flex-1 bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><IdCard size={16} /> Hand out card</Button>
      </form>
      <ul className="scrollbar-thin -mr-2 mt-4 grid max-h-[340px] gap-2 overflow-y-auto pr-2">
        {cards.length === 0 && <li className="rounded-xl border border-dashed border-[#d8c8a6] px-4 py-5 text-center text-sm text-[#857967]">No one is waiting to register.</li>}
        {cards.map((card) => (
          <li key={card.number} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${card.calledAt ? "border-[#d8a321] bg-[#fff9e9]" : "border-[#e8dfce]"}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#2f281c] text-lg font-extrabold tabular-nums text-[#f0c864]">{card.number}</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{card.calledAt ? `Called ${card.calls > 1 ? `×${card.calls}` : ""}` : "Waiting"}</p>
              <p className="text-[#7d725f]">Since {formatTime(card.issuedAt)} · {formatWait(minutesSince(card.issuedAt, now))}</p>
            </div>
            <Button size="icon-sm" variant="outline" title="Call this card" aria-label={`Call card ${card.number}`} onClick={() => run({ type: "callCard", card: card.number })}><BellRing size={15} /></Button>
            <Button size="sm" onClick={() => onRegister(card.number)} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]">Register</Button>
            <Button size="icon-sm" variant="ghost" title="Remove card" aria-label={`Remove card ${card.number}`} onClick={() => run({ type: "removeCard", card: card.number })}><X size={15} /></Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RegisterForm({ state, run, shared, initialCard }: { state: QueueState; run: (action: QueueAction, success?: string) => Promise<ActionResult>; shared: boolean; initialCard: number | null }) {
  const [kind, setKind] = useState<PatientKind>("W");
  const [card, setCard] = useState<number | null>(initialCard);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(false);
  const [stations, setStations] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ visitId: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const available = state.settings.stations.filter((station) => station.active);
  const issuedVisit = issued ? state.visits.find((visit) => visit.id === issued.visitId) : undefined;

  const submit = async () => {
    setBusy(true);
    const result = await run({ type: "register", visit: { kind, name, mobile, notes, priority, stations, card: kind === "W" ? card : null } });
    setBusy(false);
    if (!result.ok) return;
    setIssued({ visitId: result.visitId!, label: result.label! });
    setName(""); setMobile(""); setNotes(""); setPriority(false); setStations([]); setCard(null);
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
        {kind === "W" && (
          <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Laminated card
            <select value={card ?? ""} onChange={(event) => setCard(event.target.value ? Number(event.target.value) : null)} className="h-[42px] rounded-md border border-[#d8c79f] bg-white px-3 text-base font-normal">
              <option value="">No card</option>
              {[...state.cards].sort((a, b) => a.number - b.number).map((item) => <option key={item.number} value={item.number}>Card {item.number}</option>)}
              {card !== null && !state.cards.some((item) => item.number === card) && <option value={card}>Card {card}</option>}
            </select>
          </label>
        )}
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Patient name<Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" autoComplete="off" className="text-base font-normal" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Mobile number <span className="-mt-1 text-xs font-normal text-[#857967]">Optional — for the one-time queue message</span><Input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09XX XXX XXXX" autoComplete="off" className="text-base font-normal" /></label>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-[#514838]">Services today, in order</legend>
          {stations.length > 0 && (
            <ol className="grid gap-1.5">
              {stations.map((code, index) => (
                <li key={`${code}-${index}`} className="flex items-center gap-2 rounded-lg border border-[#e8dfce] bg-[#faf7f0] px-3 py-1.5 text-sm">
                  <span className="font-mono font-bold text-[#8b6512]">{index + 1}.</span>
                  <span className="font-mono font-semibold">{ticketLabel({ seq: state.nextSeq, kind }, code)}</span>
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
        <label className="flex items-start gap-3 rounded-xl border border-[#e8dfce] p-3 text-sm">
          <input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b6512]" />
          <span><span className="font-semibold">Priority lane</span><span className="block text-[#756b59]">Senior citizen, PWD or pregnant — called ahead of the regular line.</span></span>
        </label>
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
    <Panel title="Today's patients" description={toVerify ? `${toVerify} QR self check-in${toVerify > 1 ? "s" : ""} to verify at the desk.` : "Every registered patient and where they are now."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b6512]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or number" aria-label="Search patients" className="h-9 w-48 pl-8" /></div>
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
                  <TableCell className="pl-5"><span className="font-mono text-base font-extrabold">{currentLabel(visit)}</span>{visit.card !== null && <span className="block text-xs text-[#857967]">Card {visit.card}</span>}</TableCell>
                  <TableCell className="max-w-[240px]">
                    <p className="truncate font-semibold">{visit.name}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
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
                        {status !== "completed" && <MessageButton state={state} visit={visit} run={run} shared={shared} />}
                        <Button size="icon-sm" variant="ghost" title={visit.priority ? "Remove priority" : "Mark as priority"} aria-label={visit.priority ? "Remove priority" : "Mark as priority"} onClick={() => run({ type: "updateVisit", visitId: visit.id, priority: !visit.priority })}><Star size={15} className={visit.priority ? "fill-[#d8a321] text-[#d8a321]" : ""} /></Button>
                        {status !== "completed" && <Button size="icon-sm" variant="ghost" title="Cancel visit" aria-label="Cancel visit" onClick={() => { if (window.confirm(`Cancel ${currentLabel(visit)} (${visit.name})?`)) void run({ type: "cancel", visitId: visit.id }); }}><X size={15} /></Button>}
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
