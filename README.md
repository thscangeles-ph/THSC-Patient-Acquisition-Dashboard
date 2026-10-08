# THSC Patient Acquisition Dashboard

A browser-based dashboard for The Heart Specialists Clinic. Upload the standard NEW and HMO/NEW Detailed Sales Report workbooks to calculate unique patients, transactions, patient revenue, acquisition sources, and acquisition cost per patient.

Patient data is processed locally in the browser. The project has no database, server-side upload handler, or required environment variables.

## Install on a tablet or phone

The dashboard can be installed as an app. It opens full screen from the home screen and still works without a connection, because workbooks are analyzed on the device.

- **Android (Chrome) and computers (Chrome or Edge):** open the dashboard and tap **Install app** in the header, or use the browser menu → **Install app** / **Add to Home screen**.
- **iPhone and iPad:** open the dashboard in Safari, tap **Share**, then **Add to Home Screen**. The **Install app** button shows these steps.

The service worker (`public/sw.js`) saves only the app's own files. Workbooks and patient data are never cached or sent anywhere. Installing works only over HTTPS, so use the Vercel address, not `http://`.

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
