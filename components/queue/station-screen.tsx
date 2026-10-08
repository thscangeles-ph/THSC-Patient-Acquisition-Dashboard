"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BellRing, Check, Megaphone, RotateCcw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentStep, servingAt, ticketLabel, waitingFor } from "@/lib/queue/reducer";
import { formatTime, formatWait, minutesSince, stationName } from "@/lib/queue/format";
import type { ActionResult, QueueAction, QueueState, Visit } from "@/lib/queue/types";
import { Panel, StaffShell } from "./staff-shell";
import { readStorage, useNow, useQueue, writeStorage } from "./use-queue";

const STATION_KEY = "thsc-queue-station";

export function StationScreen() {
  const queue = useQueue();
  return <StaffShell queue={queue} active="station" title="Queue Board · Stations">{(state) => <Station state={state} dispatch={queue.dispatch} />}</StaffShell>;
}

function Station({ state, dispatch }: { state: QueueState; dispatch: (action: QueueAction) => Promise<ActionResult> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const [error, setError] = useState("");
  const stations = state.settings.stations.filter((station) => station.active);
  const wanted = params.get("s") ?? readStorage(STATION_KEY);
  const code = stations.find((station) => station.code === wanted)?.code ?? stations[0]?.code;
  const station = stations.find((item) => item.code === code);

  if (!station) return <p className="py-20 text-center text-[#756b59]">No active stations. Add one in Front desk → Settings.</p>;

  const run = async (action: QueueAction) => {
    const result = await dispatch(action);
    setError(result.ok ? "" : result.error);
  };
  const serving = servingAt(state, station.code);
  const waiting = waitingFor(state, station.code);
  const missed = state.visits.filter((visit) => { const step = currentStep(visit); return !visit.cancelled && step?.station === station.code && step.status === "missed"; });
  const next = waiting[0];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose station">
        {stations.map((item) => {
          const count = waitingFor(state, item.code).length;
          return (
            <button key={item.code} role="tab" aria-selected={item.code === station.code} type="button" onClick={() => { writeStorage(STATION_KEY, item.code); router.replace(`${pathname}?s=${item.code}`); }}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${item.code === station.code ? "border-[#2f281c] bg-[#2f281c] text-white" : "border-[#e2d7c2] bg-[#fffefb] text-[#4c4436] hover:border-[#d8a321]"}`}>
              <span className="font-mono">{item.code}</span><span className={item.code === station.code ? "text-[#e8dec7]" : "text-[#756b59]"}>{item.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${count ? "bg-[#d8a321] text-[#2f281c]" : "bg-[#efebe4] text-[#7d725f]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {error && <p role="alert" className="rounded-xl bg-[#fde8eb] px-4 py-3 text-sm font-semibold text-[#9b1f35]">{error}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <section className="rounded-2xl border border-[#5b4a2d] bg-[#2f281c] p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#f0c864]">Now serving · {station.name}</p>
            {serving.length === 0 && <p className="mt-6 text-lg text-[#e8dec7]">No patient called yet.</p>}
            {serving.map((visit) => <Serving key={visit.id} state={state} visit={visit} stationCode={station.code} now={now} run={run} />)}
          </section>
          <Button onClick={() => void run({ type: "call", station: station.code })} disabled={!next} className="h-20 rounded-2xl bg-[#d8a321] text-xl font-extrabold text-[#2f281c] shadow-sm hover:bg-[#f0c864]">
            <BellRing size={24} /> {next ? <>Call next · <span className="font-mono">{ticketLabel(next, station.code)}</span></> : "No one waiting"}
          </Button>
          {serving.length > 0 && next && <p className="-mt-3 text-center text-sm text-[#756b59]">Calling the next patient marks {ticketLabel(serving[0], station.code)} as complete.</p>}
        </div>

        <div className="grid gap-5">
          <Panel title={`Waiting for ${station.name}`} description="Priority lane patients are called first, then in arrival order.">
            {waiting.length === 0 ? <p className="py-6 text-center text-sm text-[#857967]">The line is empty.</p> : (
              <ol className="grid gap-2">
                {waiting.map((visit, index) => (
                  <li key={visit.id} className="flex items-center gap-3 rounded-xl border border-[#e8dfce] px-3 py-2">
                    <span className="w-6 text-right text-sm font-bold tabular-nums text-[#8b6512]">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-lg font-extrabold">{ticketLabel(visit, station.code)}</p>
                      <p className="truncate text-sm text-[#5e5443]">{visit.name}{visit.priority && <span className="ml-2 rounded-full bg-[#fff0bd] px-2 py-0.5 text-xs font-semibold text-[#5f4307]">Priority</span>}</p>
                    </div>
                    <span className="text-sm tabular-nums text-[#756b59]">{formatWait(minutesSince(currentStep(visit)?.queuedAt ?? null, now))}</span>
                    <Button size="sm" variant="outline" onClick={() => void run({ type: "call", station: station.code, visitId: visit.id })}>Call</Button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {missed.length > 0 && (
            <Panel title="Missed calls" description="Patients who did not respond. Call again or return them to the line.">
              <ul className="grid gap-2">
                {missed.map((visit) => (
                  <li key={visit.id} className="flex items-center gap-3 rounded-xl border border-[#f3cdd4] bg-[#fff7f8] px-3 py-2">
                    <div className="min-w-0 flex-1"><p className="font-mono text-lg font-extrabold">{ticketLabel(visit, station.code)}</p><p className="truncate text-sm text-[#5e5443]">{visit.name}</p></div>
                    <Button size="sm" variant="outline" onClick={() => void run({ type: "call", station: station.code, visitId: visit.id })}><BellRing size={14} /> Call again</Button>
                    <Button size="sm" variant="ghost" onClick={() => void run({ type: "requeue", visitId: visit.id })}><RotateCcw size={14} /> Back to line</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Serving({ state, visit, stationCode, now, run }: { state: QueueState; visit: Visit; stationCode: string; now: number | null; run: (action: QueueAction) => Promise<void> }) {
  const step = currentStep(visit)!;
  const index = visit.steps.indexOf(step);
  const upcoming = visit.steps[index + 1];
  const others = state.settings.stations.filter((item) => item.active && item.code !== stationCode);
  return (
    <div className="mt-4 border-t border-[#4a3d27] pt-4 first-of-type:border-0 first-of-type:pt-0">
      <p className="font-mono text-6xl font-extrabold tracking-wide text-white">{ticketLabel(visit, stationCode)}</p>
      <p className="mt-2 text-xl font-semibold">{visit.name}{visit.priority && <span className="ml-3 rounded-full bg-[#f0c864] px-2.5 py-0.5 align-middle text-sm text-[#2f281c]">Priority</span>}</p>
      <p className="mt-1 text-sm text-[#e8dec7]">Called {step.calledAt ? formatTime(step.calledAt) : ""} · {formatWait(minutesSince(step.calledAt, now))} ago{step.calls > 1 ? ` · called ${step.calls}×` : ""}{visit.notes ? ` · ${visit.notes}` : ""}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void run({ type: "recall", visitId: visit.id })} variant="secondary"><Megaphone size={16} /> Call again</Button>
        <Button onClick={() => void run({ type: "miss", visitId: visit.id })} variant="ghost" className="text-[#f4c3cc] hover:bg-[#4a3d27] hover:text-white"><UserX size={16} /> Did not respond</Button>
        <Button onClick={() => void run({ type: "complete", visitId: visit.id })} className="bg-[#f0c864] text-[#2f281c] hover:bg-[#d8a321]"><Check size={16} /> {upcoming ? <>Complete · next {upcoming.station}</> : "Complete visit"}</Button>
      </div>
      {others.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#cbbd9d]">Complete and send to</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((item) => (
              <button key={item.code} type="button" onClick={() => void run({ type: "complete", visitId: visit.id, sendTo: item.code })} className="inline-flex items-center gap-1.5 rounded-full border border-[#5c4b2d] px-3 py-1.5 text-sm text-[#e8dec7] hover:border-[#f0c864] hover:text-white">
                <ArrowRight size={13} /><span className="font-mono font-semibold">{item.code}</span>{stationName(state, item.code)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
