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
