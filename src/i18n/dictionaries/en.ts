// Canonical dictionary. Other locales are typed against `Dictionary` so any
// missing key is a compile error.
export const en = {
  brand: "SiteDoc AI",
  title: "Website QA reports your team can act on.",
  subtitle:
    "Scan a public URL for accessibility, SEO, performance, and UX issues — deterministic checks plus AI explanation, in one shareable report.",
  newAudit: "New audit",
  newAuditHint: "Scan a public page URL.",
  urlLabel: "Website URL",
  urlPlaceholder: "https://your-site.com",
  modulesTitle: "Audit modules",
  modulesHint: "all run by default",
  modules: [
    "URL safety validation",
    "Desktop screenshot",
    "Mobile screenshot",
    "Console & network capture",
  ],
  run: "Run audit",
  running: "Running audit…",
  pipeline: "Scanner pipeline",
  steps: [
    "Validating public URL",
    "Launching isolated browser",
    "Capturing desktop screenshot",
    "Capturing mobile screenshot",
    "Saving audit artifacts",
  ],
  overallHealth: "Overall health",
  scanning: "Scanning…",
  noAudit: "No audit run yet",
  scoresRunning: "Capturing browser signals and scoring the page…",
  scoresIdle:
    "Run an audit to populate health scores. Accessibility, SEO, and performance engines arrive in upcoming updates.",
  copyLink: "Copy report link",
  copied: "Copied!",
  exportPdf: "Export PDF",
  exportPdfTitle: "PDF export arrives with report persistence.",
  resultsHeading: "Audit results",
  language: "Language",
  tabs: {
    overview: "Overview",
    issues: "Issues",
    screenshots: "Screenshots",
    metrics: "Metrics",
  },
  summary: "Summary",
  summaryEmpty: "Run an audit to generate a summary from real browser signals.",
  nextAction: "Next action",
  nextActionDone:
    "Review the detected issues and screenshots. Accessibility, SEO, and AI remediation passes build on this scan.",
  nextActionIdle:
    "Start with a public URL that does not require login or private network access.",
  filterAll: "All",
  issuesEmpty:
    "Run an audit to collect console errors, failed requests, and screenshot artifacts.",
  issuesNone: "No issues were detected for this filter. 🎉",
  shotDesktop: "Desktop · 1440px",
  shotMobile: "Mobile · 390px",
  awaitingScan: "Awaiting scan",
  metricsEmpty:
    "Run an audit to save scan timing, final URL, and browser signal metrics.",
  categories: {
    Accessibility: "Accessibility",
    SEO: "SEO",
    Performance: "Performance",
    UX: "UX",
    BestPractices: "Best Practices",
    Console: "Console",
    Network: "Network",
    Scanner: "Scanner",
  },
  severities: { High: "High", Medium: "Medium", Low: "Low" },
  celestial: {
    moon: "Moon",
    mars: "Mars",
    saturn: "Saturn",
    earth: "Earth",
    sun: "Sun",
    galaxy: "Galaxy",
  },
  statuses: {
    queued: "queued",
    running: "running",
    completed: "completed",
    failed: "failed",
  },
};

export type Dictionary = typeof en;
