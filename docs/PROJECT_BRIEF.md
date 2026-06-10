## Recommended Project: SiteDoc AI

**One-line concept**

SiteDoc AI is an AI-powered website QA platform that scans a public URL and produces a developer-ready audit report for accessibility, performance, SEO, UX, and visual issues.

This is easy for employers to judge: they paste a website URL, run an audit, and immediately see screenshots, scores, detected issues, severity levels, and AI-generated fix suggestions.

## Why This Is Strong For Your CV

This project shows skills that are not duplicated with your ERP, invoice, learning, or music projects:

- Browser automation with Playwright
- Accessibility engineering with axe-core
- Performance/SEO analysis
- AI-assisted developer tooling
- Async job processing
- Report generation
- Real product UX
- Production-style architecture

It also connects to your existing strengths: React, Node.js, testing, CI/CD, AI tools, and business-focused software.

## Core Features

### 1. Website Audit

User enters a URL and selects audit options:

- Desktop scan
- Mobile scan
- Accessibility scan
- Performance scan
- SEO scan
- AI UX review

The system launches Playwright, visits the site, waits for load, captures screenshots, and collects page metadata.

### 2. Accessibility Analysis

Use `axe-core` inside the browser page.

Detected issues:

- Missing alt text
- Low contrast
- Missing labels
- Invalid heading order
- Button/link accessibility problems
- Form accessibility problems

Each issue should show:

- Severity
- Affected element
- Explanation
- Suggested fix

### 3. Performance & SEO Checks

MVP can use custom checks first, then Lighthouse later if needed.

Checks:

- Page title exists
- Meta description exists
- H1 exists
- Image alt coverage
- Large images
- Slow load time
- Missing Open Graph tags
- Too many console errors
- Failed network requests

### 4. AI UX Review

Send structured audit data plus screenshot context to AI.

AI generates:

- Executive summary
- Top 5 issues
- Developer fix suggestions
- UX improvement ideas
- Priority ranking: High / Medium / Low

Important: AI should not be the only analyzer. The product should combine deterministic checks plus AI explanation. That looks much more professional.

### 5. Report Dashboard

Each audit report page shows:

- Overall score
- Accessibility score
- SEO score
- Performance score
- UX score
- Desktop and mobile screenshots
- Issue list grouped by category
- AI summary
- Export/share button

### 6. Shareable Public Report

Each report gets a public link:

```text
/SiteDoc.ai/report/{reportId}
```

This is very useful for your CV because employers can open and judge the product immediately.

## Tech Stack

Recommended stack:

```text
Frontend: Next.js, React, Tailwind CSS, shadcn/ui
Backend: Next.js API routes or NestJS
Browser automation: Playwright
Accessibility: axe-core
Database: PostgreSQL on Neon
ORM: Prisma
AI: OpenAI API or Claude API
Storage: Supabase Storage or Cloudinary
Queue: Upstash Redis + BullMQ, or simple DB polling for MVP
Auth: Optional for v1
Deployment: Vercel frontend, Render worker/backend, Neon database
Testing: Playwright, Vitest/Jest
CI/CD: GitHub Actions
```

For 2 weeks, I recommend:

```text
Next.js full-stack + Prisma + Neon + Playwright worker
```

Keep it simple. Avoid separate frontend/backend unless needed.

## MVP User Flow

1. User opens landing/dashboard page.
2. User enters URL.
3. User clicks “Run Audit.”
4. App creates audit job.
5. Worker runs Playwright scan.
6. App displays loading/progress state.
7. Report page appears with screenshots, scores, issues, and AI summary.
8. User can copy public report link.

## Suggested Data Model

```text
Audit
- id
- url
- status: queued | running | completed | failed
- overallScore
- accessibilityScore
- seoScore
- performanceScore
- uxScore
- desktopScreenshotUrl
- mobileScreenshotUrl
- aiSummary
- createdAt
- completedAt

AuditIssue
- id
- auditId
- category: accessibility | seo | performance | ux | console | network
- severity: high | medium | low
- title
- description
- selector
- recommendation

AuditMetric
- id
- auditId
- name
- value
- unit
```

## 2-Week Build Plan

### Days 1-2: Foundation

- Create Next.js app.
- Add Tailwind/shadcn UI.
- Set up Prisma + Neon.
- Create audit form and report page shell.
- Define audit/report database models.

### Days 3-4: Playwright Scanner

- Build URL validation.
- Launch Playwright browser.
- Capture desktop screenshot.
- Capture mobile screenshot.
- Collect console errors.
- Collect failed network requests.
- Save audit status and artifacts.

### Days 5-6: Accessibility + SEO Checks

- Inject axe-core.
- Save accessibility issues.
- Add SEO checks: title, meta description, H1, image alt, canonical, Open Graph.
- Add basic scoring system.

### Days 7-8: AI Report Generation

- Send structured issues to AI.
- Generate summary, top problems, and fix recommendations.
- Save AI output to audit report.
- Add fallback if AI fails.

### Days 9-10: Report UI

- Build polished report dashboard.
- Add score cards.
- Add screenshot preview.
- Add issue filters.
- Add severity badges.
- Add copy report link.

### Days 11-12: Production Polish

- Add error states.
- Add loading/progress UI.
- Add sample demo report.
- Improve mobile layout.
- Add README with screenshots and architecture diagram.

### Days 13-14: Deploy + Test

- Deploy database to Neon.
- Deploy app to Vercel.
- Deploy Playwright worker to Render if Vercel serverless is too limited.
- Add GitHub Actions.
- Add Playwright E2E test for audit flow.
- Finalize CV bullets.

## Best CV Entry

```text
SiteDoc AI - AI Website QA & UX Audit Platform
06/2026 - 06/2026

Built an AI-powered website audit platform that scans public URLs and generates developer-ready reports for accessibility, SEO, performance, and UX issues.

Technologies: Next.js, Playwright, axe-core, PostgreSQL/Neon, Prisma, OpenAI API, Tailwind CSS, GitHub Actions, Vercel

- Implemented browser-based website scanning with Playwright, including desktop/mobile screenshots, console error tracking, and failed network request detection
- Integrated axe-core accessibility analysis and custom SEO/performance checks to generate categorized issue reports with severity levels
- Used AI to summarize audit results, rank high-impact issues, and generate developer-focused remediation suggestions
- Built shareable audit report pages with scorecards, screenshots, issue filtering, and public report links
- Added automated tests and CI workflow covering URL submission, audit processing, and report rendering
```

## My Recommendation

Build **SiteDoc AI** instead of **AuditPilot AI**.

The name is clearer, less generic, and immediately communicates “prove this page is ready.” It also looks good on a CV:

```text
SiteDoc AI - AI Website QA & UX Audit Platform
```

This project gives you the strongest combination of: impressive demo, modern stack, visible product value, AI features, and realistic 2-week scope.