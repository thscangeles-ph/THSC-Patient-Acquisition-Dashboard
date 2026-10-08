"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { BellRing, CheckCircle2, Clock, Printer, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentLabel, currentStep, findStation } from "@/lib/queue/reducer";
import { patientsAhead, visitStatus } from "@/lib/queue/format";
import type { QueueState } from "@/lib/queue/types";
import { readStorage, useQueue, writeStorage } from "./use-queue";

const TICKET_KEY = "thsc-queue-ticket";

function PatientFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#2e291f]">
      <header className="bg-[#2f281c] px-5 py-4 text-white">
        <div className="mx-auto flex max-w-md items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="52" height="40" className="h-10 w-[52px] object-contain" />
          <div><p className="text-xs font-semibold tracking-[0.08em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><p className="text-lg font-bold">Queue</p></div>
        </div>
      </header>
      <div className="mx-auto max-w-md px-5 py-6">{children}</div>
    </main>
  );
}

function storedTicket(state: QueueState) {
  try {
    const saved = JSON.parse(readStorage(TICKET_KEY) || "null") as { id: string; day: string } | null;
    return saved && saved.day === state.day && state.visits.some((visit) => visit.id === saved.id && !visit.cancelled) ? saved.id : null;
  } catch {
    return null;
  }
}

export function CheckIn() {
  const queue = useQueue();
  const router = useRouter();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [main, setMain] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [priority, setPriority] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const state = queue.state;

  if (!state) return <PatientFrame><p className="py-16 text-center text-[#756b59]">{queue.error || "Loading…"}</p></PatientFrame>;
  const existing = storedTicket(state);
  const consults = state.settings.stations.filter((station) => station.active && station.selfCheckIn);
  const others = state.settings.stations.filter((station) => station.active && !station.selfCheckIn);

  const submit = async () => {
    setBusy(true);
    const result = await queue.dispatch({ type: "selfCheckIn", visit: { name, mobile, priority, stations: [main, ...extras] } });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    writeStorage(TICKET_KEY, JSON.stringify({ id: result.visitId, day: state.day }));
    router.push(`/queue/ticket?id=${result.visitId}`);
  };

  return (
    <PatientFrame>
      <h1 className="text-2xl font-bold tracking-tight">Scheduled patient check-in</h1>
      <p className="mt-1 text-[#6a604f]">Get your queue number as soon as you arrive. Walk-in patients, please go to the front desk.</p>
      {existing && (
        <Link href={`/queue/ticket?id=${existing}`} className="mt-5 flex items-center gap-3 rounded-2xl bg-[#2f281c] p-4 text-white">
          <Ticket className="text-[#f0c864]" /><span className="flex-1"><span className="block text-sm text-[#e8dec7]">You are already checked in</span><span className="font-semibold">View my queue number →</span></span>
        </Link>
      )}
      {queue.mode === "local" && <p className="mt-5 rounded-xl bg-[#fff9e9] px-4 py-3 text-sm text-[#5f4307]">This check-in page is running in single-device mode and only works on the front-desk computer.</p>}
      <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Full name<Input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="text-base font-normal" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Mobile number (optional)<Input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} autoComplete="tel" placeholder="09XX XXX XXXX" className="text-base font-normal" /></label>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold text-[#514838]">Your appointment is with</legend>
          {consults.map((station) => (
            <label key={station.code} className={`flex items-center gap-3 rounded-xl border p-3 ${main === station.code ? "border-[#8b6512] bg-[#fff9e9]" : "border-[#e2d7c2] bg-white"}`}>
              <input type="radio" name="main" value={station.code} checked={main === station.code} onChange={() => setMain(station.code)} className="h-4 w-4 accent-[#8b6512]" required />
              <span className="font-semibold">{station.name}</span>
            </label>
          ))}
        </fieldset>
        {others.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-[#514838]">Also scheduled today <span className="font-normal text-[#857967]">— you keep the same number</span></legend>
            {others.map((station) => (
              <label key={station.code} className="flex items-center gap-3 rounded-xl border border-[#e2d7c2] bg-white p-3">
                <input type="checkbox" checked={extras.includes(station.code)} onChange={(event) => setExtras((current) => (event.target.checked ? [...current, station.code] : current.filter((code) => code !== station.code)))} className="h-4 w-4 accent-[#8b6512]" />
                <span>{station.name}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex items-start gap-3 rounded-xl border border-[#e2d7c2] bg-white p-3 text-sm">
          <input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b6512]" />
          <span><span className="font-semibold">I am a senior citizen, PWD or pregnant</span><span className="block text-[#756b59]">Please show your ID at the front desk.</span></span>
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-[#b4233c]">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || !main} className="h-12 bg-[#8b6512] text-base text-white hover:bg-[#6f4e0a]">Get my queue number</Button>
        <p className="text-xs leading-5 text-[#857967]">Your name is shared only with clinic staff. The lobby screen shows queue numbers only.</p>
      </form>
    </PatientFrame>
  );
}

export function TicketView() {
  const queue = useQueue();
  const id = useSearchParams().get("id");
  const state = queue.state;
  const visit = state?.visits.find((item) => item.id === id);
  const status = visit ? visitStatus(visit) : null;
  const lastStatus = useRef(status);

  useEffect(() => {
    if (status === "called" && lastStatus.current !== "called") navigator.vibrate?.([400, 150, 400]);
    lastStatus.current = status;
  }, [status]);

  if (!state) return <PatientFrame><p className="py-16 text-center text-[#756b59]">{queue.error || "Loading…"}</p></PatientFrame>;
  if (!visit || visit.cancelled) return <PatientFrame><h1 className="text-xl font-bold">Queue number not found</h1><p className="mt-2 text-[#6a604f]">It may be from a previous day. Please ask the front desk for help.</p><Link href="/queue/checkin" className="mt-5 inline-block font-semibold text-[#8b6512] underline">Go to check-in</Link></PatientFrame>;

  const step = currentStep(visit);
  const station = step ? findStation(state, step.station) : undefined;
  const ahead = patientsAhead(state, visit);
  const messages: Record<string, { title: string; text: string; icon: React.ReactNode; tone: string }> = {
    called: { title: "It's your turn!", text: `Please proceed to ${station?.location || station?.name || "the station"}.`, icon: <BellRing />, tone: "bg-[#d8a321] text-[#2f281c]" },
    waiting: { title: ahead === 0 ? "You're next" : `${ahead} patient${ahead > 1 ? "s" : ""} ahead of you`, text: `Waiting for ${station?.name ?? "your service"}. Watch the lobby TV for your number.`, icon: <Clock />, tone: "bg-[#fff2c8] text-[#5f4307]" },
    missed: { title: "We called your number", text: "Please approach the front desk so we can put you back in line.", icon: <BellRing />, tone: "bg-[#fde8eb] text-[#9b1f35]" },
    completed: { title: "All done for today", text: "Thank you for visiting The Heart Specialists Clinic.", icon: <CheckCircle2 />, tone: "bg-[#edf5e8] text-[#41612c]" },
  };
  const message = messages[status ?? "waiting"] ?? messages.waiting;

  return (
    <PatientFrame>
      <section className="rounded-2xl bg-[#2f281c] p-6 text-center text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f0c864]">Your queue number</p>
        <p className="mt-2 font-mono text-5xl font-extrabold tracking-wide">{currentLabel(visit)}</p>
        <p className="mt-2 text-sm text-[#e8dec7]">Keep this number for every service today.</p>
      </section>
      <div className={`mt-4 flex items-start gap-3 rounded-2xl p-4 ${message.tone}`} role="status" aria-live="polite">
        <span className="mt-0.5 shrink-0">{message.icon}</span>
        <div><p className="text-lg font-bold">{message.title}</p><p className="text-sm">{message.text}</p></div>
      </div>
      <ol className="mt-5 grid gap-2">
        {visit.steps.map((item, index) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e2d7c2] bg-white px-4 py-3">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${item.status === "done" ? "bg-[#edf5e8] text-[#41612c]" : item === step ? "bg-[#2f281c] text-[#f0c864]" : "bg-[#f2ecdf] text-[#857967]"}`}>{item.status === "done" ? "✓" : index + 1}</span>
            <span className="flex-1">{findStation(state, item.station)?.name ?? item.station}</span>
            <span className="font-mono text-sm text-[#756b59]">{item.station}</span>
          </li>
        ))}
      </ol>
      {!visit.verified && <p className="mt-5 text-sm text-[#6a604f]">Please drop by the front desk once so staff can confirm your check-in.</p>}
      <p className="mt-6 text-center text-xs text-[#857967]">This page updates automatically.</p>
    </PatientFrame>
  );
}

function QrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2f281c", light: "#ffffff" } }).then((markup) => { if (active) setSvg(markup); });
    return () => { active = false; };
  }, [value]);
  return <div className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code for ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CheckInPoster() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setUrl(`${window.location.origin}/queue/checkin`), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="min-h-screen bg-[#f7f4ed] py-8 text-[#2e291f] print:bg-white print:py-0">
      <div className="mx-auto mb-5 flex max-w-[680px] justify-between gap-3 px-5 print:hidden">
        <Link href="/queue" className="font-semibold text-[#8b6512] underline">← Front desk</Link>
        <Button onClick={() => window.print()} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><Printer size={16} /> Print poster</Button>
      </div>
      <article className="mx-auto max-w-[680px] rounded-3xl border border-[#e2d7c2] bg-white p-10 text-center shadow-sm print:border-0 print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="104" height="80" className="mx-auto h-20 w-auto object-contain" />
        <p className="mt-3 text-sm font-semibold tracking-[0.12em] text-[#8b6512]">THE HEART SPECIALISTS CLINIC</p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Scheduled today?</h1>
        <p className="mt-2 text-xl text-[#5e5443]">Scan to check in and get your queue number.</p>
        <div className="mx-auto mt-8 w-72 rounded-2xl border-4 border-[#2f281c] p-3">{url && <QrCode value={url} />}</div>
        <p className="mt-3 break-all font-mono text-sm text-[#756b59]">{url}</p>
        <ol className="mx-auto mt-8 grid max-w-md gap-3 text-left text-lg">
          <li><strong>1.</strong> Scan the code and enter your name.</li>
          <li><strong>2.</strong> Your queue number (e.g. 01-C1-S) appears on your phone.</li>
          <li><strong>3.</strong> Watch the lobby TV — your number is called there.</li>
        </ol>
        <p className="mt-8 rounded-xl bg-[#fff2c8] px-4 py-3 font-semibold text-[#5f4307]">Walk-in patients: please proceed to the front desk for a number.</p>
      </article>
    </main>
  );
}
