"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, Volume2, VolumeX } from "lucide-react";
import { servingAt, ticketLabel, TIME_ZONE, waitingFor } from "@/lib/queue/reducer";
import { spokenLabel } from "@/lib/queue/format";
import type { Announcement, QueueState } from "@/lib/queue/types";
import { SyncBadge } from "./staff-shell";
import { useNow, useQueue } from "./use-queue";

const HIGHLIGHT_MS = 15000;
const clock = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const date = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });

function chime(context: AudioContext) {
  [880, 659.25].forEach((frequency, index) => {
    const start = context.currentTime + index * 0.42;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.2);
  });
}

function speechFor(item: Announcement) {
  if (item.kind === "card") return `${item.label.replace("Card", "Card number")}. Please proceed to the ${item.destination}.`;
  return `Queue number, ${spokenLabel(item.label)}. Please proceed to ${item.destination}.`;
}

export function DisplayBoard() {
  const queue = useQueue();
  const now = useNow(1000);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<string | null | undefined>(undefined);
  const state = queue.state;

  // Announce calls made after this screen loaded, in order.
  useEffect(() => {
    if (!state) return;
    const list = state.announcements;
    if (seenRef.current === undefined) { seenRef.current = list[list.length - 1]?.id ?? null; return; }
    const lastIndex = list.findIndex((item) => item.id === seenRef.current);
    const fresh = list.slice(lastIndex + 1).filter((item) => Date.now() - item.at < 60000);
    seenRef.current = list[list.length - 1]?.id ?? null;
    if (!fresh.length || !sound) return;
    const context = audioRef.current;
    fresh.forEach((item, index) => {
      setTimeout(() => {
        if (context) chime(context);
        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(speechFor(item));
          utterance.rate = 0.9;
          utterance.lang = "en-US";
          setTimeout(() => window.speechSynthesis.speak(utterance), 900);
        }
      }, index * 6000);
    });
  }, [state, sound]);

  const enableSound = () => {
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioRef.current && Context) audioRef.current = new Context();
    void audioRef.current?.resume();
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    setSound(true);
  };

  return (
    <main className="flex h-screen min-h-[600px] flex-col overflow-hidden bg-[#1f1a12] text-white">
      <header className="flex items-center justify-between gap-6 border-b border-[#4a3d27] bg-[#2f281c] px-[2.5vw] py-[1.4vh]">
        <div className="flex items-center gap-[1.2vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic" width="80" height="62" className="h-[6vh] w-auto object-contain" />
          <div><p className="text-[1.1vw] font-semibold tracking-[0.12em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><p className="text-[1.9vw] font-bold leading-tight">Queue Board</p></div>
        </div>
        <div className="text-right">
          <p className="text-[2.6vw] font-bold leading-none tabular-nums">{now ? clock.format(now) : ""}</p>
          <p className="mt-1 text-[1vw] text-[#e8dec7]">{now ? date.format(now) : ""}</p>
        </div>
      </header>
      {state ? <Board state={state} now={now} /> : <div className="grid flex-1 place-items-center text-[2vw] text-[#cbbd9d]">{queue.error || "Connecting to the queue…"}</div>}
      <footer className="flex items-center gap-4 overflow-hidden border-t border-[#4a3d27] bg-[#2f281c] py-[1.2vh]">
        <div className="relative flex-1 overflow-hidden whitespace-nowrap text-[1.35vw] text-[#f4e8c7]"><span className="animate-marquee inline-block pl-[100%]">{state?.settings.ticker}</span></div>
        <div className="flex shrink-0 items-center gap-2 pr-[1.5vw] opacity-70 transition hover:opacity-100">
          <SyncBadge queue={queue} dark />
          <button type="button" onClick={() => (sound ? setSound(false) : enableSound())} className="rounded-full p-2 hover:bg-[#4a3d27]" aria-label={sound ? "Mute announcements" : "Turn on announcements"}>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
          <button type="button" onClick={() => void document.documentElement.requestFullscreen?.()} className="rounded-full p-2 hover:bg-[#4a3d27]" aria-label="Full screen"><Expand size={20} /></button>
        </div>
      </footer>
      {!sound && (
        <button type="button" onClick={enableSound} className="fixed bottom-[9vh] right-[2vw] flex items-center gap-3 rounded-2xl bg-[#d8a321] px-6 py-4 text-lg font-bold text-[#2f281c] shadow-2xl">
          <Volume2 size={24} /> Tap to turn on chime &amp; voice announcements
        </button>
      )}
    </main>
  );
}

function Board({ state, now }: { state: QueueState; now: number | null }) {
  const stations = state.settings.stations.filter((station) => station.active);
  const latest = state.announcements[state.announcements.length - 1];
  const fresh = Boolean(latest && now && now - latest.at < HIGHLIGHT_MS);
  const lastCard = [...state.announcements].reverse().find((item) => item.kind === "card" && state.cards.some((card) => `Card ${card.number}` === item.label));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-[1.5vw] p-[1.5vw]">
      <div className="flex min-h-0 flex-col gap-[1.5vw]">
        <section className={`flex flex-[1.15] flex-col items-center justify-center rounded-[1.5vw] border-[0.25vw] text-center transition-colors duration-700 ${fresh ? "animate-call border-[#f0c864] bg-[#4a3612]" : "border-[#4a3d27] bg-[#2a2318]"}`}>
          <p className="text-[1.6vw] font-semibold uppercase tracking-[0.2em] text-[#f0c864]">{latest ? "Now calling" : "Welcome"}</p>
          {latest ? (
            <>
              <p className="mt-[1vh] font-mono text-[8.5vw] font-extrabold leading-none tracking-wide">{latest.label}</p>
              <p className="mt-[2vh] text-[2.2vw] font-semibold text-[#f4e8c7]">Please proceed to <span className="text-white">{latest.destination}</span></p>
            </>
          ) : <p className="mt-[2vh] max-w-[80%] text-[2.2vw] text-[#f4e8c7]">Please wait for your queue number to appear on this screen.</p>}
        </section>
        <section className="grid min-h-0 flex-1 auto-rows-fr gap-[1vw]" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(stations.length, 1), 3)}, minmax(0, 1fr))` }}>
          {stations.map((station) => {
            const serving = servingAt(state, station.code)[0];
            return (
              <div key={station.code} className="flex min-h-0 flex-col justify-center rounded-[1vw] border border-[#4a3d27] bg-[#2a2318] px-[1.4vw] py-[1vh]">
                <p className="truncate text-[1.15vw] font-semibold text-[#cbbd9d]"><span className="font-mono text-[#f0c864]">{station.code}</span> · {station.name}</p>
                <p className={`mt-[0.5vh] font-mono text-[3vw] font-extrabold leading-tight ${serving ? "text-white" : "text-[#5c4b2d]"}`}>{serving ? ticketLabel(serving, station.code) : "—"}</p>
              </div>
            );
          })}
        </section>
      </div>

      <section className="flex min-h-0 flex-col rounded-[1.5vw] border border-[#4a3d27] bg-[#2a2318] p-[1.4vw]">
        <h2 className="text-[1.6vw] font-bold uppercase tracking-[0.14em] text-[#f0c864]">Next in line</h2>
        {lastCard && <div className="mt-[1.2vh] flex items-baseline justify-between rounded-[0.8vw] bg-[#4a3612] px-[1.2vw] py-[1vh]"><span className="text-[1.3vw] text-[#f4e8c7]">Registration · Front Desk</span><span className="font-mono text-[2.4vw] font-extrabold">{lastCard.label}</span></div>}
        <div className="mt-[1.2vh] grid min-h-0 flex-1 content-start gap-[1.2vh] overflow-hidden">
          {stations.map((station) => {
            const waiting = waitingFor(state, station.code);
            return (
              <div key={station.code} className="border-b border-[#3a3022] pb-[1vh] last:border-0">
                <p className="flex justify-between text-[1.1vw] text-[#cbbd9d]"><span className="truncate">{station.name}</span><span className="tabular-nums">{waiting.length} waiting</span></p>
                <div className="mt-[0.6vh] flex flex-wrap gap-[0.6vw]">
                  {waiting.length === 0 && <span className="text-[1.5vw] text-[#5c4b2d]">—</span>}
                  {waiting.slice(0, 4).map((visit) => <span key={visit.id} className="rounded-[0.5vw] bg-[#3a3022] px-[0.8vw] py-[0.3vh] font-mono text-[1.75vw] font-bold">{ticketLabel(visit, station.code)}</span>)}
                  {waiting.length > 4 && <span className="self-center text-[1.2vw] text-[#cbbd9d]">+{waiting.length - 4} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
