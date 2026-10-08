"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, KeyRound, LayoutDashboard, Monitor, QrCode, Stethoscope, Users, Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QueueState } from "@/lib/queue/types";
import type { useQueue } from "./use-queue";

type Queue = ReturnType<typeof useQueue>;
type NavKey = "desk" | "station" | "display" | "poster";

const NAV: { key: NavKey | "dashboard"; href: string; label: string; icon: React.ReactNode; newTab?: boolean }[] = [
  { key: "desk", href: "/queue", label: "Front desk", icon: <Users size={16} /> },
  { key: "station", href: "/queue/station", label: "Stations", icon: <Stethoscope size={16} /> },
  { key: "display", href: "/queue/display", label: "TV display", icon: <Monitor size={16} />, newTab: true },
  { key: "poster", href: "/queue/poster", label: "Check-in QR", icon: <QrCode size={16} /> },
  { key: "dashboard", href: "/", label: "Acquisition dashboard", icon: <LayoutDashboard size={16} /> },
];

export function SyncBadge({ queue, dark = false }: { queue: Queue; dark?: boolean }) {
  if (queue.mode === "detecting") return null;
  if (queue.mode === "local") {
    return <span title="Queue data is kept in this browser. Open the TV display on this same computer." className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${dark ? "bg-[#4a3d27] text-[#f0c864]" : "bg-[#fff2c8] text-[#6f4e0a]"}`}><Monitor size={13} /> This device only</span>;
  }
  return queue.online && !queue.error
    ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${dark ? "bg-[#33421f] text-[#cfe6b8]" : "bg-[#edf5e8] text-[#41612c]"}`}><Wifi size={13} /> Live · shared</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fde8eb] px-2.5 py-1 text-xs font-semibold text-[#9b1f35]"><WifiOff size={13} /> Reconnecting…</span>;
}

function PinGate({ queue }: { queue: Queue }) {
  const [pin, setPin] = useState("");
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-6 shadow-sm">
      <div className="flex items-center gap-2 text-[#8b6512]"><KeyRound size={18} /><span className="text-sm font-semibold">Staff access</span></div>
      <h2 className="mt-2 text-lg font-bold">Enter the staff PIN</h2>
      <p className="mt-1 text-sm text-[#756b59]">Staff screens show patient names, so they are protected. The PIN is remembered on this device.</p>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (pin.trim()) queue.setPin(pin.trim()); }}>
        <Input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="PIN" aria-label="Staff PIN" className="text-base" autoFocus />
        {queue.pinRejected && <p className="text-sm font-semibold text-[#b4233c]">That PIN was not accepted.</p>}
        <Button type="submit" className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]">Unlock</Button>
      </form>
    </div>
  );
}

export function StaffShell({ queue, active, title, actions, children }: { queue: Queue; active: NavKey; title: string; actions?: React.ReactNode; children: (state: QueueState) => React.ReactNode }) {
  const locked = queue.mode === "server" && !queue.staff && !queue.error;
  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#2e291f]">
      <header className="border-b border-[#5c4b2d] bg-[#2f281c] text-white">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="52" height="40" className="h-10 w-[52px] shrink-0 object-contain" />
            <div className="min-w-0"><p className="truncate text-xs font-semibold tracking-[0.08em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><h1 className="truncate text-lg font-bold tracking-tight">{title}</h1></div>
          </div>
          <div className="flex items-center gap-3"><SyncBadge queue={queue} dark />{actions}</div>
        </div>
        <nav className="mx-auto flex max-w-[1480px] gap-1 overflow-x-auto px-3 pb-2 lg:px-6" aria-label="Queue screens">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href} target={item.newTab ? "_blank" : undefined} aria-current={item.key === active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${item.key === active ? "bg-[#f0c864] text-[#2f281c]" : "text-[#e8dec7] hover:bg-[#4a3d27] hover:text-white"} ${item.key === "dashboard" ? "ml-auto" : ""}`}>
              {item.icon}{item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8">
        {queue.error && <Alert variant="destructive" className="mb-5 border-[#efb5bf] bg-[#fff7f8]"><AlertCircle className="h-4 w-4" /><AlertTitle>Queue server problem</AlertTitle><AlertDescription>{queue.error}</AlertDescription></Alert>}
        {queue.mode === "local" && active === "desk" && (
          <p className="mb-5 rounded-xl border border-[#ead9ad] bg-[#fff9e9] px-4 py-3 text-sm leading-6 text-[#5f4307]">
            <strong>Single-device mode.</strong> Queue data stays in this browser, so open the TV display and station screens on this same computer (for example, the TV as a second screen). To connect separate tablets, TVs and patient phones, turn on shared storage as described in the README.
          </p>
        )}
        {locked ? <PinGate queue={queue} /> : queue.state ? children(queue.state) : !queue.error && <p className="py-20 text-center text-[#756b59]">Connecting to the queue…</p>}
      </div>
    </main>
  );
}

export function Panel({ title, description, actions, children, className = "" }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#e2d7c2] bg-[#fffefb] shadow-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee6d8] px-5 py-4">
        <div><h2 className="text-base font-bold">{title}</h2>{description && <p className="mt-0.5 text-sm text-[#756b59]">{description}</p>}</div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
