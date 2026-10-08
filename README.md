# THSC Patient Acquisition Dashboard

A browser-based dashboard for The Heart Specialists Clinic. Upload the standard NEW and HMO/NEW Detailed Sales Report workbooks to calculate unique patients, transactions, patient revenue, acquisition sources, and acquisition cost per patient.

The project also includes the **THSC Queue Board** (`/queue`), a patient queuing system for the front desk, consultation rooms, procedures, laboratory and the lobby TV. See [Queue Board](#queue-board).

Patient data for the acquisition dashboard is processed locally in the browser. The dashboard has no database, server-side upload handler, or required environment variables.

## Run locally

Requirements: Node.js 20.9 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

### From GitHub, GitLab, or Bitbucket

1. Upload this project to a Git repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel will detect **Next.js** automatically.
4. Keep the default build command (`next build`) and deploy.

### With the Vercel CLI

```bash
npx vercel
```

No environment variables are required. They are only needed to turn on the Queue Board's shared mode (see [Sync modes](#sync-modes)).

## Workbook rules

- The app finds the header row automatically using: `Date`, `Transaction No.`, `Patient Name`, `Patient Type`, `Source`, and `Total Payment`.
- Only `NEW` and `HMO/NEW` records are included.
- One unique normalized `Patient Name` equals one acquired patient.
- Patient names are used only for counting and are never displayed.

## Queue Board

The queue follows the clinic's arrival flow:

1. **Patient arrives** and goes to the front desk.
2. **Concierge** hands a walk-in patient a laminated card (Front desk → *Hand out card*) and calls the card when it is their turn to register. The card number shows on the TV.
3. **Concierge registers the patient** on the Queue Board (and in the Lab Info System as usual), picks their services in order, and tells the patient their queue number, e.g. `01-C1-W`.
4. **The patient watches the TV**, which shows every queue number being called and who is next.

### Queue numbers

`01-C1-W` = `[daily number]-[station]-[W walk-in / S scheduled]`.

- The daily number starts at 01 every day (Manila time) and is shared by walk-in and scheduled patients.
- **One number per visit.** A patient keeps the same daily number for consultation, procedures and laboratory; only the station code changes (`01-C1-W` → `01-L1-W`).
- Station codes, names and rooms are set in Front desk → **Settings**. Defaults: C1–C3 Consultation, P1 Procedures (ECG / 2D Echo), L1 Laboratory.
- Patients marked **Priority lane** (senior citizen, PWD, pregnant) are called ahead of the regular line.

### Screens

| Screen | URL | Used by |
| --- | --- | --- |
| Front desk | `/queue` | Concierge: laminated cards, registration, today's patient list, one-time queue message, settings |
| Stations | `/queue/station?s=C1` | Doctors, procedure and lab staff: *Call next*, call again, did not respond, complete, or complete and send to another station |
| TV display | `/queue/display` | Lobby TV: now calling, now serving at each station, next in line. Tap once to turn on the chime and voice announcement |
| QR check-in | `/queue/checkin` | Scheduled patients scan the QR poster on arrival and get their `S` queue number on their phone |
| Check-in poster | `/queue/poster` | Printable QR poster for the entrance |
| Patient ticket | `/queue/ticket?id=…` | Live status on the patient's phone (opened after QR check-in, or from the link in the queue message) |

**Scheduled patients** get their queue number by scanning the QR poster at the entrance (advance registration). Their check-in shows as *QR check-in · verify* on the front desk until a concierge confirms it. The concierge can also register a scheduled patient manually by choosing *Scheduled (S)*.

**One-time message:** *Copy message* on the front desk copies an SMS/Viber text with the patient's queue number (and a live-status link in shared mode) and marks the patient as messaged, so the message is sent only once.

**Privacy:** patient names and mobile numbers appear only on staff screens. The TV and patient phones receive queue numbers only. In shared mode, staff screens require the staff PIN.

### Sync modes

**Single-device mode (default, no setup).** Queue data stays in the browser of one computer and syncs between its tabs and windows. Use this when the lobby TV is connected to the front-desk PC as a second screen: open `/queue` on the desk monitor and `/queue/display` full-screen on the TV. In this mode, station pages and QR check-in only work on that same computer.

**Shared mode (multiple devices).** The front desk, station tablets, the TV and patient phones all see the same queue. Choose one storage option and set a staff PIN:

| Where it runs | Environment variables |
| --- | --- |
| Vercel | Add an Upstash Redis database from the Vercel Marketplace (it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`), or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` yourself. Then add `QUEUE_STAFF_PIN` and redeploy. |
| A clinic PC on the local network | `QUEUE_STORE=file` and `QUEUE_STAFF_PIN=…`. Data is saved to `.queue-data/queue.json` (change it with `QUEUE_DATA_FILE`). Run `pnpm build && pnpm start`, then open `http://<pc-address>:3000/queue` on the other devices. |

Screens refresh every 2 seconds. With Upstash, each open screen makes about one request every 2 seconds, so a full clinic day goes over the free tier; expect a small pay-as-you-go charge.

**TV tips:** browsers only play sound after a tap, so tap *Turn on chime & voice announcements* once after opening the TV display. For an unattended TV, launch Chrome with `--kiosk --autoplay-policy=no-user-gesture-required`.
