# SiteDoc AI

SiteDoc AI is an AI-assisted website QA dashboard for generating developer-ready audit reports across accessibility, performance, SEO, and UX quality.

The current version includes a real Playwright scanner: submit a public URL, launch Chromium, capture desktop and mobile screenshots, collect console errors and failed network requests, save local audit artifacts, and review the generated report in the dashboard.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- Playwright

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## MVP Features

- URL audit form with selectable audit modules
- Public URL validation with local/private network blocking
- Playwright-powered desktop and mobile screenshot capture
- Browser console error collection
- Failed network request and HTTP 4xx/5xx collection
- Local JSON audit records under `.data/audits`
- Local screenshot artifacts under `public/audit-artifacts`
- Scanner, console, network, and overall scorecards
- Categorized issue list with severity labels and remediation guidance
- Responsive dashboard layout

## Roadmap

- Integrate axe-core accessibility checks
- Generate AI remediation reports from real audit data
- Persist audit reports with PostgreSQL
- Add public share links and PDF export

## Local Artifact Storage

Scanner results are saved locally for MVP development:

```text
.data/audits/{auditId}.json
public/audit-artifacts/{auditId}/desktop.png
public/audit-artifacts/{auditId}/mobile.png
```

These paths are ignored by git. A production deployment should move audit records to PostgreSQL and screenshots to object storage.
