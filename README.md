# SiteDoc AI

SiteDoc AI is an AI-assisted website QA dashboard for generating developer-ready audit reports across accessibility, performance, SEO, and UX quality.

The current version is a polished frontend MVP that demonstrates the core product workflow: submit a URL, run an audit simulation, review scores, inspect categorized issues, and read AI-style remediation guidance.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint

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
- Simulated scan pipeline state
- Accessibility, SEO, performance, and UX scorecards
- Categorized issue list with severity labels
- Desktop and mobile screenshot placeholders
- AI remediation summary panel
- Responsive dashboard layout

## Roadmap

- Add real Playwright page scanning
- Integrate axe-core accessibility checks
- Capture desktop and mobile screenshots
- Collect console errors and failed network requests
- Generate AI remediation reports from real audit data
- Persist audit reports with PostgreSQL
- Add public share links and PDF export
