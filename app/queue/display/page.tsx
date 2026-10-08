import type { Metadata } from "next";
import { DisplayBoard } from "@/components/queue/display-board";

export const metadata: Metadata = { title: "TV Display · THSC Queue Board", description: "Lobby screen showing the queue numbers being called." };

export default function DisplayPage() {
  return <DisplayBoard />;
}
