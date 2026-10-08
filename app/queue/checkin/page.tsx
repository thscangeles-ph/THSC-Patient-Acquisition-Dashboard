import type { Metadata } from "next";
import { CheckIn } from "@/components/queue/patient-screens";

export const metadata: Metadata = { title: "Check-in · The Heart Specialists Clinic", description: "Scheduled patients: check in and get your queue number.", manifest: "/patient.webmanifest" };

export default function CheckInPage() {
  return <CheckIn />;
}
