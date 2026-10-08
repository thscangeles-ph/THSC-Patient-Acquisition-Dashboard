# THSC Patient Acquisition Dashboard

A browser-based dashboard for The Heart Specialists Clinic. Upload the standard NEW and HMO/NEW Detailed Sales Report workbooks to calculate unique patients, transactions, patient revenue, acquisition sources, and acquisition cost per patient.

Patient data is processed locally in the browser. The project has no database, server-side upload handler, or required environment variables.

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

No environment variables are required.

## Workbook rules

- The app finds the header row automatically using: `Date`, `Transaction No.`, `Patient Name`, `Patient Type`, `Source`, and `Total Payment`.
- Only `NEW` and `HMO/NEW` records are included.
- One unique normalized `Patient Name` equals one acquired patient.
- Patient names are used only for counting and are never displayed.

## Patient queue (Clinic 1, Clinic 2, Clinic 3)

Open `/queue` (or **Patient queue** in the dashboard header) at the front desk.

- **Add patient**: enter the name, pick Clinic 1, 2 or 3, and choose the Regular or Priority lane (senior citizens, PWD, pregnant women). The patient receives a queue number such as `C2-004`, which can be printed.
- **Per clinic**: set the doctor's name, mark the clinic open or closed, **Call next**, **Call again**, mark **Done** or **No-show**, call someone out of turn, transfer a patient to another clinic, or remove them.
- **Order**: Priority lane first, then first come, first served. Estimated waits use the clinic's average consultation time today (15 minutes until there is data).
- **History**: patients seen and no-shows for the day; a late no-show can be put back in line in their original place.
- **Waiting-room display**: open `/queue/display` on a TV or second monitor. It shows each clinic's current and next numbers, and after **Turn on announcements** is clicked it plays a chime and reads out each call. Patient names are never shown on the display.

Queue data is saved in the browser (`localStorage`) and shared live between tabs and windows of the same browser on the same computer, so run the front-desk console and the waiting-room display on one computer (the display on an extended screen). Ticket numbers restart at 001 each new day; doctor names and open/closed status are kept.
