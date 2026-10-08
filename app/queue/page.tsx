import type { Metadata } from "next";
import { FrontDesk } from "@/components/queue/front-desk";

export const metadata: Metadata = { title: "Front Desk · THSC Queue Board", description: "Register patients and issue queue numbers." };

export default function QueuePage() {
  return <FrontDesk />;
}
