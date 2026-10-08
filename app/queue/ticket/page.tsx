import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketView } from "@/components/queue/patient-screens";

export const metadata: Metadata = { title: "My Queue Number · The Heart Specialists Clinic", description: "Live status of your queue number.", manifest: "/patient.webmanifest" };

export default function TicketPage() {
  return <Suspense><TicketView /></Suspense>;
}
