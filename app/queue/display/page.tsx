"use client";

import { useEffect, useRef, useState } from "react";
import { Accessibility, Maximize, Volume2, VolumeX } from "lucide-react";
import { CLINIC_IDS, clinicById, servingAt, useNow, useQueue, waitingFor, type ClinicId, type QueueState } from "@/lib/queue";

const FRESH_CALL_MS = 20_000;

// Waiting-room screen. Shows queue numbers only so no patient names appear in public.
export default function QueueDisplayPage() {
  const state = useQueue();
  const now = useNow();
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const announcedRef = useRef<number>(0);

  useEffect(() => {
    const call = state.lastCall;
    if (!call || call.at <= announcedRef.current) return;
    announcedRef.current = call.at;
    // Skip calls that happened before this screen was opened or while it was asleep.
    if (!soundOn || Date.now() - call.at > FRESH_CALL_MS) return;
    const clinic = clinicById(state, call.clinicId);
    chime(audioRef.current);
    if ("speechSynthesis" in window) {
      const seq = Number(call.number.split("-").pop());
      const text = `Queue number ${seq}, ${clinic.name}. Please proceed to ${clinic.name}${clinic.doctor ? `, ${clinic.doctor}` : ""}.`;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-PH"; utterance.rate = 0.9;
      window.setTimeout(() => window.speechSynthesis.speak(utterance), 700);
    }
  }, [state, soundOn]);

  const enableSound = () => {
    if (soundOn) { setSoundOn(false); return; }
    audioRef.current ??= new AudioContext();
    void audioRef.current.resume();
    chime(audioRef.current);
    setSoundOn(true);
  };

  const lastCall = state.lastCall;
  const recentCall = lastCall && now && now - lastCall.at < FRESH_CALL_MS ? lastCall : null;

  return (
    <main className="flex min-h-screen flex-col bg-[#1f1a12] text-white">
      <header className="flex items-center justify-between gap-4 border-b border-[#5c4b2d] bg-[#2f281c] px-6 py-4 lg:px-10">
        <div className="flex min-w-0 items-center gap-4">
          <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="78" height="60" className="h-[60px] w-[78px] shrink-0 object-contain" />
          <div className="min-w-0"><p className="truncate text-base font-semibold tracking-[0.08em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">Now Serving</h1></div>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-3xl font-bold tabular-nums sm:block" suppressHydrationWarning>{now ? new Date(now).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : ""}</p>
          <button type="button" onClick={enableSound} className={`inline-flex items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${soundOn ? "border-[#5c4b2d] bg-transparent text-[#e8dec7] hover:bg-[#4a3d27]" : "animate-pulse border-[#d8a321] bg-[#d8a321] text-[#2f281c]"}`}>{soundOn ? <><Volume2 size={18} /> Sound on</> : <><VolumeX size={18} /> Turn on announcements</>}</button>
          <button type="button" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} aria-label="Full screen" className="inline-flex w-[42px] items-center justify-center rounded-lg border border-[#5c4b2d] text-[#e8dec7] hover:bg-[#4a3d27]"><Maximize size={18} /></button>
        </div>
      </header>

      {recentCall && <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-[#d8a321] px-6 py-3 text-center text-[#2f281c]"><span className="text-xl font-semibold">Calling</span><span className="text-3xl font-extrabold tabular-nums">{recentCall.number}</span><span className="text-xl font-semibold">→ please proceed to {clinicById(state, recentCall.clinicId).name}</span></div>}

      <section className="grid flex-1 gap-5 p-5 md:grid-cols-3 lg:gap-6 lg:p-8">
        {CLINIC_IDS.map((id) => <ClinicPanel key={id} state={state} clinicId={id} highlight={recentCall?.clinicId === id} />)}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#5c4b2d] bg-[#2f281c] px-6 py-4 text-lg text-[#e8dec7] lg:px-10">
        <p>Please keep your queue number and watch this screen for your turn.</p>
        <p className="flex items-center gap-2"><Accessibility size={20} className="text-[#f0c864]" /> Priority lane: Senior citizens · PWD · Pregnant women</p>
      </footer>
    </main>
  );
}

function ClinicPanel({ state, clinicId, highlight }: { state: QueueState; clinicId: ClinicId; highlight: boolean }) {
  const clinic = clinicById(state, clinicId);
  const serving = servingAt(state, clinicId);
  const waiting = waitingFor(state, clinicId);
  return (
    <div className={`flex flex-col overflow-hidden rounded-3xl border-2 bg-[#2f281c] transition ${highlight ? "border-[#f0c864] shadow-[0_0_40px_rgba(240,200,100,.35)]" : "border-[#4a3d27]"}`}>
      <div className="border-b border-[#4a3d27] px-6 py-5 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight lg:text-4xl">{clinic.name}</h2>
        <p className="mt-1 min-h-[1.75rem] text-xl text-[#f0c864]">{clinic.doctor}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        {!clinic.open && !serving ? <p className="text-4xl font-bold text-[#9a8e78]">Closed</p> : <>
          <p className="text-lg font-semibold uppercase tracking-[0.12em] text-[#e8dec7]">Now serving</p>
          <p className={`mt-2 whitespace-nowrap font-extrabold leading-none tracking-tight tabular-nums ${serving ? "text-white" : "text-[#6f6450]"} ${highlight ? "animate-pulse" : ""}`} style={{ fontSize: "clamp(3.5rem, 7vw, 8rem)" }}>{serving ? serving.number : "—"}</p>
        </>}
      </div>
      <div className="border-t border-[#4a3d27] bg-[#261f15] px-6 py-5">
        <div className="flex items-center justify-between text-[#e8dec7]"><p className="text-lg font-semibold">Next in line</p><p className="text-lg tabular-nums">{waiting.length} waiting</p></div>
        <div className="mt-3 flex min-h-[52px] flex-wrap gap-2">{waiting.length ? waiting.slice(0, 5).map((t) => <span key={t.id} className="inline-flex items-center gap-1.5 rounded-xl bg-[#4a3d27] px-3 py-2 text-2xl font-bold tabular-nums">{t.number}{t.priority === "priority" && <Accessibility size={18} className="text-[#f0c864]" aria-label="Priority" />}</span>) : <span className="py-2 text-xl text-[#9a8e78]">No one waiting</span>}</div>
      </div>
    </div>
  );
}

function chime(context: AudioContext | null) {
  if (!context) return;
  [880, 660].forEach((frequency, index) => {
    const start = context.currentTime + index * 0.35;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine"; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(context.destination);
    osc.start(start); osc.stop(start + 0.65);
  });
}
