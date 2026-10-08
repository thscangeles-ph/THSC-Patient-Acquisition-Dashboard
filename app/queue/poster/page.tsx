import type { Metadata } from "next";
import { CheckInPoster } from "@/components/queue/patient-screens";

export const metadata: Metadata = { title: "Check-in QR Poster · THSC Queue Board", description: "Printable QR code for scheduled patient check-in." };

export default function PosterPage() {
  return <CheckInPoster />;
}
