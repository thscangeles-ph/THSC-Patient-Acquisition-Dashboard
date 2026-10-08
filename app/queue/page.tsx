"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Accessibility, ArrowRightLeft, BellRing, CheckCircle2, Clock, DoorClosed, DoorOpen, Hourglass, LayoutDashboard, Megaphone, Monitor, Printer, RotateCcw, Stethoscope, Ticket as TicketIcon, Trash, Undo2, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { averageServiceMinutes, averageWaitMinutes, CLINIC_IDS, clinicById, queue, servingAt, useNow, useQueue, waitingFor, type ClinicId, type Priority, type QueueState, type Ticket } from "@/lib/queue";

const time = (value: number) => new Date(value).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const minutesSince = (from: number, now: number) => (now ? Math.max(0, Math.floor((now - from) / 60_000)) : 0);
const formatMinutes = (minutes: number) => minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;

export default function QueuePage() {
  const state = useQueue();
  const now = useNow();
  const nameRef = useRef<HTMLInputElement>(null);
  const [patientName, setPatientName] = useState("");
  const [clinicId, setClinicId] = useState<ClinicId>("clinic-1");
  const [priority, setPriority] = useState<Priority>("regular");
  const [note, setNote] = useState("");
  const [issuedId, setIssuedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const count = (status: Ticket["status"]) => state.tickets.filter((t) => t.status === status).length;
    return { waiting: count("waiting"), serving: count("serving"), done: count("done"), noShow: count("no-show"), avgWait: averageWaitMinutes(state) };
  }, [state]);
  const history = useMemo(() => state.tickets.filter((t) => t.status === "done" || t.status === "no-show").sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)), [state]);

  const register = (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientName.trim()) { nameRef.current?.focus(); return; }
    setIssuedId(queue.addPatient({ clinicId, patientName, priority, note }).id);
    setPatientName(""); setNote(""); setPriority("regular");
    nameRef.current?.focus();
  };

  const resetDay = () => {
    if (window.confirm("Clear today's queue and restart ticket numbers at 001? Doctor names and clinic status are kept.")) { queue.resetDay(); setIssuedId(null); }
  };

  const issued = state.tickets.find((t) => t.id === issuedId) ?? null;
  const issuedClinic = issued ? clinicById(state, issued.clinicId) : null;
  const issuedPosition = issued ? waitingFor(state, issued.clinicId).findIndex((t) => t.id === issued.id) : -1;

  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#2e291f] print:bg-white">
      <header className="border-b border-[#5c4b2d] bg-[#2f281c] text-white print:hidden">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="62" height="48" className="h-12 w-[62px] shrink-0 object-contain" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold tracking-[0.08em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><h1 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">Patient Queue</h1></div>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><Link href="/"><LayoutDashboard size={16} /> Dashboard</Link></Button>
            <Button asChild className="bg-[#d8a321] text-[#2f281c] hover:bg-[#f0c864]"><a href="/queue/display" target="_blank" rel="noopener"><Monitor size={16} /> Open waiting-room display</a></Button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-5 py-6 print:hidden lg:px-8 lg:py-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={register} className="rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff2c8] text-[#8b6512]"><TicketIcon size={22} /></div><div><h2 className="text-lg font-bold">Add patient to the queue</h2><p className="text-sm text-[#756b59]">Register the patient on arrival and give them their queue number.</p></div></div>
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Patient name<Input ref={nameRef} value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="e.g. Juan Dela Cruz" autoComplete="off" className="bg-white text-base" /></label>
              <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Clinic / doctor
                <Select value={clinicId} onValueChange={(value) => setClinicId(value as ClinicId)}>
                  <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{state.clinics.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.doctor ? ` — ${c.doctor}` : ""}{c.open ? "" : " (closed)"} · {waitingFor(state, c.id).length} waiting</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <fieldset className="grid gap-1.5 text-sm font-semibold text-[#514838]"><legend className="mb-1.5">Lane</legend>
                <div className="grid grid-cols-2 gap-2">
                  <LaneOption checked={priority === "regular"} onChange={() => setPriority("regular")} icon={<Users size={16} />} label="Regular" />
                  <LaneOption checked={priority === "priority"} onChange={() => setPriority("priority")} icon={<Accessibility size={16} />} label="Priority" hint="Senior · PWD · Pregnant" />
                </div>
              </fieldset>
              <label className="grid gap-1.5 text-sm font-semibold text-[#514838]"><span>Note <span className="font-normal text-[#857967]">(optional)</span></span><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Follow-up, ECG result" autoComplete="off" className="bg-white text-base" /></label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="submit" className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><TicketIcon size={17} /> Issue queue number</Button>
              {clinicById(state, clinicId).open ? null : <span className="rounded-lg bg-[#fff3d0] px-3 py-2 text-sm font-semibold text-[#795600]">{clinicById(state, clinicId).name} is marked closed — the patient will wait until it opens.</span>}
            </div>
          </form>

          <aside className="flex flex-col justify-between rounded-2xl border border-[#5b4a2d] bg-[#2f281c] p-6 text-white shadow-sm">
            {issued && issuedClinic ? <>
              <div><p className="text-sm font-semibold text-[#f0c864]">Last number issued</p><p className="mt-2 text-5xl font-extrabold tracking-tight tabular-nums">{issued.number}</p><p className="mt-2 text-base text-[#e8dec7]">{issuedClinic.name}{issuedClinic.doctor ? ` · ${issuedClinic.doctor}` : ""}</p>
                <p className="mt-1 text-sm text-[#e8dec7]">{issuedPosition < 0 ? "Already called" : issuedPosition === 0 ? "Next in line" : `Position ${issuedPosition + 1} in line · about ${formatMinutes(issuedPosition * averageServiceMinutes(state, issued.clinicId))} wait`}</p></div>
              <Button onClick={() => window.print()} variant="outline" className="mt-5 border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><Printer size={16} /> Print ticket</Button>
            </> : <div><div className="flex items-center gap-2 text-[#f0c864]"><Monitor size={19} /><span className="text-sm font-semibold">Waiting-room display</span></div><p className="mt-3 text-lg font-semibold leading-7">Show the display on the TV.</p><p className="mt-2 text-sm leading-6 text-[#e8dec7]">The display shows queue numbers only — never patient names — and announces each call aloud. Open it on a second screen connected to this computer.</p></div>}
          </aside>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<Hourglass size={20} />} label="Waiting" value={stats.waiting} detail="Across all clinics" />
          <Stat icon={<Stethoscope size={20} />} label="With the doctor" value={stats.serving} detail="Currently being seen" />
          <Stat icon={<CheckCircle2 size={20} />} label="Seen today" value={stats.done} detail={`${stats.noShow} no-show`} />
          <Stat accent icon={<Clock size={20} />} label="Average wait" value={stats.avgWait === null ? "—" : formatMinutes(stats.avgWait)} detail="Arrival to being called" />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-3">
          {CLINIC_IDS.map((id) => <ClinicColumn key={id} state={state} clinicId={id} now={now} />)}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#e2d7c2] bg-[#fffefb] shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-[#e8dfce] p-5 sm:flex-row sm:items-center sm:p-6"><div><h2 className="text-lg font-bold">Today&apos;s history</h2><p className="mt-1 text-sm text-[#756b59]">Patients already seen or marked no-show. A late patient can be returned to the line.</p></div><Button variant="outline" onClick={resetDay} className="border-[#d8c79f] bg-white text-[#8b2335] hover:bg-[#fff7f8] hover:text-[#8b2335]"><RotateCcw size={16} /> Reset queue for a new day</Button></div>
          {history.length ? <ul className="max-h-[360px] divide-y divide-[#eee6d8] overflow-auto">{history.map((t) => {
            const c = clinicById(state, t.clinicId);
            return <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
              <span className="w-20 font-bold tabular-nums">{t.number}</span>
              <span className="min-w-[160px] flex-1 font-semibold text-[#463d30]">{t.patientName}</span>
              <span className="text-sm text-[#756b59]">{c.name}</span>
              <span className="text-sm tabular-nums text-[#756b59]">{t.calledAt ? `Waited ${formatMinutes((t.calledAt - t.createdAt) / 60_000)}` : "Not called"} · {t.finishedAt ? time(t.finishedAt) : ""}</span>
              {t.status === "no-show" ? <><span className="rounded-full bg-[#fff3d0] px-2.5 py-0.5 text-xs font-semibold text-[#795600]">No-show</span><Button size="sm" variant="outline" onClick={() => queue.requeue(t.id)}><Undo2 size={15} /> Back in line</Button></> : <span className="rounded-full bg-[#edf5e8] px-2.5 py-0.5 text-xs font-semibold text-[#41612c]">Seen</span>}
            </li>;
          })}</ul> : <p className="px-6 py-10 text-center text-[#7d725f]">No patients have finished yet today.</p>}
        </section>
        <footer className="mt-6 flex flex-col gap-2 border-t border-[#ddd2bd] py-5 text-sm text-[#756b59] sm:flex-row sm:items-center sm:justify-between"><p>Priority lane patients are called ahead of the regular lane, then first come, first served.</p><p>Queue data is saved in this browser and resets each new day.</p></footer>
      </div>

      {issued && issuedClinic && <div className="hidden text-center text-black print:block">
        <p className="text-sm font-semibold">THE HEART SPECIALISTS CLINIC</p>
        <p className="mt-4 text-sm">Your queue number</p>
        <p className="text-6xl font-extrabold">{issued.number}</p>
        <p className="mt-3 text-lg font-semibold">{issuedClinic.name}{issuedClinic.doctor ? ` · ${issuedClinic.doctor}` : ""}</p>
        {issued.priority === "priority" && <p className="text-sm font-semibold">PRIORITY LANE</p>}
        <p className="mt-3 text-sm">Issued {time(issued.createdAt)} · Please watch the screen for your number.</p>
      </div>}
    </main>
  );
}

function ClinicColumn({ state, clinicId, now }: { state: QueueState; clinicId: ClinicId; now: number }) {
  const clinic = clinicById(state, clinicId);
  const serving = servingAt(state, clinicId);
  const waiting = waitingFor(state, clinicId);
  const perPatient = averageServiceMinutes(state, clinicId);
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border bg-[#fffefb] shadow-sm ${clinic.open ? "border-[#e2d7c2]" : "border-dashed border-[#d3bf8e] opacity-80"}`}>
      <div className="border-b border-[#e8dfce] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{clinic.name}</h2>
          <Button size="sm" variant="outline" onClick={() => queue.updateClinic(clinicId, { open: !clinic.open })} className={clinic.open ? "border-[#cfe0c3] bg-[#edf5e8] text-[#41612c] hover:bg-[#e2efd9]" : "border-[#e2d7c2] bg-[#f2ecdf] text-[#756b59]"}>{clinic.open ? <><DoorOpen size={15} /> Open</> : <><DoorClosed size={15} /> Closed</>}</Button>
        </div>
        <label className="mt-3 grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#8b6512]">Doctor<Input value={clinic.doctor} onChange={(e) => queue.updateClinic(clinicId, { doctor: e.target.value })} placeholder="e.g. Dr. Santos" className="bg-white text-base normal-case tracking-normal text-[#2e291f]" /></label>
      </div>

      <div className="border-b border-[#e8dfce] bg-[#faf5e9] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8b6512]">Now serving</p>
        {serving ? <div className="mt-2">
          <div className="flex items-baseline justify-between gap-3"><p className="text-4xl font-extrabold tracking-tight tabular-nums">{serving.number}</p>{serving.calledAt && <p className="text-sm tabular-nums text-[#756b59]">since {time(serving.calledAt)}</p>}</div>
          <p className="mt-1 font-semibold text-[#463d30]">{serving.patientName}{serving.priority === "priority" && <PriorityBadge />}</p>
          {serving.note && <p className="text-sm text-[#756b59]">{serving.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => queue.complete(serving.id)} className="bg-[#41612c] text-white hover:bg-[#344f22]"><UserCheck size={15} /> Done</Button>
            <Button size="sm" variant="outline" onClick={() => queue.recall(serving.id)} className="bg-white"><BellRing size={15} /> Call again</Button>
            <Button size="sm" variant="outline" onClick={() => queue.noShow(serving.id)} className="bg-white text-[#795600]"><UserX size={15} /> No-show</Button>
            <Button size="sm" variant="ghost" onClick={() => queue.requeue(serving.id)} title="Return to the line in their original place"><Undo2 size={15} /> Back in line</Button>
          </div>
        </div> : <p className="mt-2 text-lg font-semibold text-[#9a8e78]">No patient called</p>}
        <Button onClick={() => queue.callNext(clinicId)} disabled={!waiting.length && !serving} className="mt-4 w-full bg-[#8b6512] text-base text-white hover:bg-[#6f4e0a]"><Megaphone size={17} /> {waiting.length ? `Call next${serving ? " (finishes current)" : ""}: ${waiting[0].number}` : serving ? "Finish current patient" : "No one waiting"}</Button>
      </div>

      <div className="flex items-center justify-between px-5 pt-4"><p className="text-sm font-bold">Waiting <span className="ml-1 rounded-full bg-[#fff2c8] px-2 py-0.5 tabular-nums text-[#5f4307]">{waiting.length}</span></p><p className="text-xs text-[#857967]">~{formatMinutes(perPatient)} per patient</p></div>
      {waiting.length ? <ol className="max-h-[520px] flex-1 divide-y divide-[#eee6d8] overflow-auto px-2 pb-2">{waiting.map((t, index) => (
        <li key={t.id} className="rounded-lg px-3 py-3 hover:bg-[#faf7f0]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-bold tabular-nums">{index + 1}. {t.number}{t.priority === "priority" && <PriorityBadge />}</p><p className="truncate font-semibold text-[#463d30]">{t.patientName}</p>{t.note && <p className="truncate text-sm text-[#756b59]">{t.note}</p>}</div>
            <div className="shrink-0 text-right text-xs tabular-nums text-[#756b59]"><p>Arrived {time(t.createdAt)}</p><p className="font-semibold text-[#5f4307]">{now ? `Waiting ${formatMinutes(minutesSince(t.createdAt, now))}` : ""}</p><p>Est. {formatMinutes(index * perPatient + (serving ? perPatient / 2 : 0))}</p></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => queue.call(t.id)} className="bg-white"><Megaphone /> Call now</Button>
            <Select value="" onValueChange={(value) => queue.transfer(t.id, value as ClinicId)}>
              <SelectTrigger size="sm" className="gap-1.5 bg-white" aria-label={`Transfer ${t.number} to another clinic`}><ArrowRightLeft /><SelectValue placeholder="Transfer" /></SelectTrigger>
              <SelectContent>{state.clinics.filter((c) => c.id !== clinicId).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.doctor ? ` — ${c.doctor}` : ""}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Remove ${t.number} (${t.patientName}) from the queue?`)) queue.remove(t.id); }} className="text-[#8b2335] hover:text-[#8b2335]"><Trash /> Remove</Button>
          </div>
        </li>
      ))}</ol> : <p className="px-5 py-10 text-center text-sm text-[#7d725f]">No patients waiting.</p>}
    </div>
  );
}

function LaneOption({ checked, onChange, icon, label, hint }: { checked: boolean; onChange: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return <label className={`flex min-h-[42px] cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-semibold transition ${checked ? "border-[#d8a321] bg-[#fff2c8] text-[#4a3612]" : "border-[#d8c79f] bg-white text-[#514838] hover:bg-[#faf7f0]"}`}>
    <input type="radio" name="lane" checked={checked} onChange={onChange} className="sr-only" />{icon}<span className="leading-tight">{label}{hint && <span className="block text-xs font-normal text-[#756b59]">{hint}</span>}</span>
  </label>;
}

function PriorityBadge() {
  return <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#e7eefb] px-2 py-0.5 align-middle text-xs font-semibold text-[#264a8a]"><Accessibility size={12} /> Priority</span>;
}

function Stat({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: number | string; detail: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? "border-[#d8a321] bg-[#4a3612] text-white" : "border-[#e2d7c2] bg-[#fffefb]"}`}><div className={`flex items-center gap-2 text-sm font-semibold ${accent ? "text-[#f0c864]" : "text-[#746957]"}`}>{icon}<span>{label}</span></div><p className="mt-4 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[1.7rem]">{value}</p><p className={`mt-1 text-sm ${accent ? "text-[#f4e8c7]" : "text-[#807562]"}`}>{detail}</p></div>;
}
