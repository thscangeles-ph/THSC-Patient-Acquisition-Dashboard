import type { Metadata } from "next";
import { Suspense } from "react";
import { StationScreen } from "@/components/queue/station-screen";

export const metadata: Metadata = { title: "Stations · THSC Queue Board", description: "Call, recall and complete patients at a consultation, procedure or laboratory station." };

export default function StationPage() {
  return <Suspense><StationScreen /></Suspense>;
}
