"use client";

import { useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult, QueueAction, QueueState, ServiceType, Settings, Station } from "@/lib/queue/types";
import { Panel } from "./staff-shell";

const SERVICES: { value: ServiceType; label: string }[] = [
  { value: "consultation", label: "Consultation" },
  { value: "procedure", label: "Procedure" },
  { value: "laboratory", label: "Laboratory" },
  { value: "other", label: "Other" },
];

export function SettingsPanel({ state, dispatch, onClose }: { state: QueueState; dispatch: (action: QueueAction) => Promise<ActionResult>; onClose: () => void }) {
  const [draft, setDraft] = useState<Settings>(() => structuredClone(state.settings));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const update = (index: number, patch: Partial<Station>) => setDraft((current) => ({ ...current, stations: current.stations.map((station, position) => (position === index ? { ...station, ...patch } : station)) }));
  const inUse = (code: string) => state.visits.some((visit) => !visit.cancelled && visit.steps.some((step) => step.station === code && step.status !== "done"));

  const save = async () => {
    const result = await dispatch({ type: "updateSettings", settings: draft });
    setMessage(result.ok ? { ok: true, text: "Settings saved. Every queue screen updates automatically." } : { ok: false, text: result.error });
  };
  const reset = async () => {
    if (!window.confirm("Clear today's queue? All queue numbers, cards and calls for today are removed and numbering restarts at 01. Settings are kept.")) return;
    const result = await dispatch({ type: "resetDay" });
    setMessage(result.ok ? { ok: true, text: "Today's queue was cleared." } : { ok: false, text: result.error });
  };

  return (
    <Panel title="Queue settings" description="Station codes become part of the queue number, e.g. C1 in 01-C1-W. Queues restart automatically at midnight."
      actions={<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-[#756b59]"><tr><th className="pb-2 pr-2 font-semibold">Code</th><th className="pb-2 pr-2 font-semibold">Station name</th><th className="pb-2 pr-2 font-semibold">Where to go (read on TV)</th><th className="pb-2 pr-2 font-semibold">Service</th><th className="pb-2 pr-2 font-semibold">QR check-in</th><th className="pb-2 pr-2 font-semibold">Active</th><th /></tr></thead>
          <tbody>
            {draft.stations.map((station, index) => (
              <tr key={index} className="border-t border-[#eee6d8]">
                <td className="py-2 pr-2"><Input value={station.code} maxLength={4} onChange={(event) => update(index, { code: event.target.value.toUpperCase() })} className="w-20 font-mono font-bold" aria-label="Station code" /></td>
                <td className="py-2 pr-2"><Input value={station.name} onChange={(event) => update(index, { name: event.target.value })} aria-label="Station name" /></td>
                <td className="py-2 pr-2"><Input value={station.location} onChange={(event) => update(index, { location: event.target.value })} placeholder="e.g. Clinic Room 1" aria-label="Location" /></td>
                <td className="py-2 pr-2">
                  <select value={station.service} onChange={(event) => update(index, { service: event.target.value as ServiceType })} className="h-[42px] rounded-md border border-[#d8c79f] bg-white px-2" aria-label="Service type">
                    {SERVICES.map((service) => <option key={service.value} value={service.value}>{service.label}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-2 text-center"><input type="checkbox" checked={station.selfCheckIn} onChange={(event) => update(index, { selfCheckIn: event.target.checked })} className="h-4 w-4 accent-[#8b6512]" aria-label="Allow QR self check-in" /></td>
                <td className="py-2 pr-2 text-center"><input type="checkbox" checked={station.active} onChange={(event) => update(index, { active: event.target.checked })} className="h-4 w-4 accent-[#8b6512]" aria-label="Station active" /></td>
                <td className="py-2 text-right">
                  <Button size="icon-sm" variant="ghost" disabled={inUse(station.code)} title={inUse(station.code) ? "Patients are still queued here — set it inactive instead" : "Remove station"} aria-label="Remove station" onClick={() => setDraft((current) => ({ ...current, stations: current.stations.filter((_, position) => position !== index) }))}><Trash2 size={15} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => setDraft((current) => ({ ...current, stations: [...current.stations, { code: "", name: "", location: "", service: "consultation", selfCheckIn: true, active: true }] }))}><Plus size={15} /> Add station</Button>

      <div className="mt-6 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Laminated cards available<Input type="number" min={1} max={300} value={draft.cardCount} onChange={(event) => setDraft((current) => ({ ...current, cardCount: Number(event.target.value) }))} className="text-base font-normal" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">TV display message<Input value={draft.ticker} maxLength={240} onChange={(event) => setDraft((current) => ({ ...current, ticker: event.target.value }))} className="text-base font-normal" /></label>
      </div>

      {message && <p className={`mt-4 text-sm font-semibold ${message.ok ? "text-[#41612c]" : "text-[#b4233c]"}`}>{message.text}</p>}
      <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-[#eee6d8] pt-4">
        <Button variant="outline" onClick={() => void reset()} className="border-[#efb5bf] text-[#b4233c] hover:bg-[#fff7f8] hover:text-[#b4233c]"><RotateCcw size={15} /> Clear today&apos;s queue</Button>
        <Button onClick={() => void save()} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><Save size={15} /> Save settings</Button>
      </div>
    </Panel>
  );
}
