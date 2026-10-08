import { applyAction, ensureDay, publicView } from "@/lib/queue/reducer";
import { getBackend, isStaff, staffPinConfigured } from "@/lib/queue/server-store";
import { PUBLIC_ACTIONS, type QueueAction, type QueueState } from "@/lib/queue/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const view = (state: QueueState, staff: boolean) => (staff ? state : publicView(state));
const misconfigured = () => json({ mode: "server", error: "Shared queue storage is set up but QUEUE_STAFF_PIN is missing. Add it to the environment variables and redeploy." }, 500);

export async function GET(request: Request) {
  const backend = getBackend();
  if (!backend) return json({ mode: "local" });
  if (!staffPinConfigured()) return misconfigured();
  const staff = isStaff(request);
  const since = new URL(request.url).searchParams.get("since");
  const { state, version } = await backend.load();
  const current = ensureDay(state, Date.now());
  // A day rollover changes the state without changing the stored version, so only skip the body when the day still matches.
  if (since !== null && Number(since) === version && state?.day === current.day) return json({ mode: "server", staff, version, unchanged: true });
  return json({ mode: "server", staff, version, state: view(current, staff) });
}

export async function POST(request: Request) {
  const backend = getBackend();
  if (!backend) return json({ mode: "local", error: "Shared queue storage is not configured." }, 404);
  if (!staffPinConfigured()) return misconfigured();
  const staff = isStaff(request);
  let action: QueueAction;
  try {
    action = ((await request.json()) as { action: QueueAction }).action;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!action || typeof action.type !== "string") return json({ error: "Invalid request." }, 400);
  if (!staff && !PUBLIC_ACTIONS.includes(action.type)) return json({ error: "Staff PIN required." }, 401);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const stored = await backend.load();
    const now = Date.now();
    const { state, result } = applyAction(stored.state, action, now);
    if (!result.ok) return json({ mode: "server", staff, version: stored.version, result, state: view(state, staff) }, 422);
    if (await backend.save(state, stored.version)) return json({ mode: "server", staff, version: stored.version + 1, result, state: view(state, staff) });
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 80));
  }
  return json({ error: "The queue is busy. Please try again." }, 409);
}
