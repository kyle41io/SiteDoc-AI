"use client";

import { FormEvent, useMemo, useState } from "react";

type AuditStatus = "idle" | "running" | "complete";
type Severity = "High" | "Medium" | "Low";
type Category = "Accessibility" | "SEO" | "Performance" | "UX";

type Issue = {
  id: number;
  title: string;
  category: Category;
  severity: Severity;
  selector: string;
  detail: string;
  fix: string;
};

const demoIssues: Issue[] = [
  {
    id: 1,
    title: "Primary CTA has weak accessible name",
    category: "Accessibility",
    severity: "High",
    selector: "button[data-action='start']",
    detail:
      "The most important action on the page is visually clear, but screen readers receive a generic label.",
    fix: "Add an explicit aria-label or improve the visible button text so assistive technology announces the intent.",
  },
  {
    id: 2,
    title: "Largest image delays first impression",
    category: "Performance",
    severity: "High",
    selector: "img.hero-media",
    detail:
      "The hero asset is loaded at full resolution and blocks the page from feeling ready on mobile.",
    fix: "Serve responsive image sizes, add width and height, and prioritize only the above-the-fold variant.",
  },
  {
    id: 3,
    title: "Meta description is missing",
    category: "SEO",
    severity: "Medium",
    selector: "head > meta[name='description']",
    detail:
      "Search engines and social previews do not have a concise description of the page purpose.",
    fix: "Add a 140-160 character meta description that matches the visible page promise.",
  },
  {
    id: 4,
    title: "Form errors are not anchored to fields",
    category: "UX",
    severity: "Medium",
    selector: "form.signup",
    detail:
      "Validation messages appear after submit, but they are not visually or programmatically linked to the field.",
    fix: "Place errors next to the field, connect them with aria-describedby, and preserve the user's input.",
  },
  {
    id: 5,
    title: "Console reports a failed analytics request",
    category: "Performance",
    severity: "Low",
    selector: "GET /analytics/events",
    detail:
      "A non-critical network request fails during page load and adds noise to production debugging.",
    fix: "Guard the analytics call with retry behavior or remove it from development and preview deployments.",
  },
];

const categoryStyles: Record<Category, string> = {
  Accessibility: "border-rose-200 bg-rose-50 text-rose-800",
  SEO: "border-amber-200 bg-amber-50 text-amber-800",
  Performance: "border-sky-200 bg-sky-50 text-sky-800",
  UX: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const severityStyles: Record<Severity, string> = {
  High: "bg-rose-100 text-rose-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-zinc-100 text-zinc-700",
};

const scoreCards = [
  { label: "Overall", value: 82, tone: "bg-zinc-950 text-white" },
  { label: "Accessibility", value: 78, tone: "bg-rose-600 text-white" },
  { label: "Performance", value: 84, tone: "bg-sky-600 text-white" },
  { label: "SEO", value: 91, tone: "bg-amber-500 text-zinc-950" },
  { label: "UX", value: 76, tone: "bg-emerald-600 text-white" },
];

const auditSteps = [
  "Launching isolated browser",
  "Capturing desktop and mobile states",
  "Running accessibility rules",
  "Checking metadata and network health",
  "Drafting AI remediation report",
];

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [status, setStatus] = useState<AuditStatus>("idle");
  const [selectedCategory, setSelectedCategory] = useState<Category | "All">(
    "All",
  );
  const [activeStep, setActiveStep] = useState(0);

  const filteredIssues = useMemo(() => {
    if (selectedCategory === "All") {
      return demoIssues;
    }

    return demoIssues.filter((issue) => issue.category === selectedCategory);
  }, [selectedCategory]);

  function runAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("running");
    setActiveStep(0);

    auditSteps.forEach((_, index) => {
      window.setTimeout(() => {
        setActiveStep(index);
      }, 450 * index);
    });

    window.setTimeout(() => {
      setStatus("complete");
      setActiveStep(auditSteps.length - 1);
    }, 2600);
  }

  return (
    <main className="min-h-screen bg-[#f6f5f1] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              SiteDoc AI
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950 md:text-4xl">
              Website QA reports your team can act on.
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">5</p>
              <p className="text-zinc-500">Checks</p>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">2</p>
              <p className="text-zinc-500">Viewports</p>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="font-semibold">AI</p>
              <p className="text-zinc-500">Fixes</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[360px_1fr]">
        <aside className="h-fit border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold">New audit</h2>
              <p className="text-sm text-zinc-500">Scan a public page URL.</p>
            </div>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              MVP
            </span>
          </div>

          <form className="mt-4 space-y-5" onSubmit={runAudit}>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">
                Website URL
              </span>
              <input
                className="mt-2 h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://your-site.com"
                type="url"
                value={url}
              />
            </label>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-zinc-700">
                Audit modules
              </legend>
              {["Accessibility", "Performance", "SEO", "AI UX review"].map(
                (label) => (
                  <label
                    className="flex items-center justify-between border border-zinc-200 px-3 py-2 text-sm"
                    key={label}
                  >
                    <span>{label}</span>
                    <input
                      className="h-4 w-4 accent-zinc-950"
                      defaultChecked
                      type="checkbox"
                    />
                  </label>
                ),
              )}
            </fieldset>

            <button
              className="h-11 w-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={status === "running"}
              type="submit"
            >
              {status === "running" ? "Running audit..." : "Run audit"}
            </button>
          </form>

          <div className="mt-5 border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-semibold">Scanner pipeline</p>
            <div className="mt-3 space-y-2">
              {auditSteps.map((step, index) => {
                const isDone =
                  status === "complete" ||
                  (status === "running" && index <= activeStep);

                return (
                  <div
                    className="flex items-center gap-2 text-sm text-zinc-600"
                    key={step}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isDone ? "bg-emerald-600" : "bg-zinc-300"
                      }`}
                    />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Audit report</h2>
                <p className="mt-1 break-all text-sm text-zinc-500">{url}</p>
              </div>
              <div className="flex gap-2">
                <button className="border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:border-zinc-950">
                  Copy link
                </button>
                <button className="border border-zinc-950 bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
                  Export PDF
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {scoreCards.map((score) => (
                <div className="border border-zinc-200 bg-zinc-50" key={score.label}>
                  <div className={`px-4 py-3 ${score.tone}`}>
                    <p className="text-sm font-medium">{score.label}</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {status === "idle" ? "--" : score.value}
                    </p>
                  </div>
                  <div className="h-1.5 bg-zinc-200">
                    <div
                      className="h-full bg-current transition-all"
                      style={{
                        width: status === "idle" ? "0%" : `${score.value}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div className="border border-zinc-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-lg font-semibold">Detected issues</h2>
                  <div className="flex flex-wrap gap-2">
                    {(["All", "Accessibility", "Performance", "SEO", "UX"] as const).map(
                      (category) => (
                        <button
                          className={`border px-3 py-1.5 text-sm font-medium transition ${
                            selectedCategory === category
                              ? "border-zinc-950 bg-zinc-950 text-white"
                              : "border-zinc-300 bg-white hover:border-zinc-950"
                          }`}
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          type="button"
                        >
                          {category}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {filteredIssues.map((issue) => (
                    <article
                      className="border border-zinc-200 bg-zinc-50 p-4"
                      key={issue.id}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`border px-2 py-1 text-xs font-semibold ${categoryStyles[issue.category]}`}
                            >
                              {issue.category}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs font-semibold ${severityStyles[issue.severity]}`}
                            >
                              {issue.severity}
                            </span>
                          </div>
                          <h3 className="mt-3 text-base font-semibold">
                            {issue.title}
                          </h3>
                        </div>
                        <code className="w-full border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 md:w-auto">
                          {issue.selector}
                        </code>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-600">
                        {issue.detail}
                      </p>
                      <p className="mt-3 border-l-2 border-emerald-600 pl-3 text-sm leading-6 text-zinc-800">
                        {issue.fix}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="border border-zinc-200 bg-white p-4">
                <h2 className="text-lg font-semibold">Screenshots</h2>
                <div className="mt-4 space-y-3">
                  {["Desktop 1440px", "Mobile 390px"].map((label) => (
                    <div
                      className="flex aspect-[16/10] items-center justify-center border border-zinc-200 bg-[linear-gradient(135deg,#f4f4f5_25%,#ffffff_25%,#ffffff_50%,#f4f4f5_50%,#f4f4f5_75%,#ffffff_75%,#ffffff_100%)] bg-[length:20px_20px]"
                      key={label}
                    >
                      <span className="bg-white px-3 py-1 text-sm font-medium text-zinc-600">
                        {status === "idle" ? "Awaiting scan" : label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-zinc-200 bg-white p-4">
                <h2 className="text-lg font-semibold">AI remediation</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  {status === "idle"
                    ? "Run an audit to generate a prioritized developer summary."
                    : "Fix the accessible name and hero image first. These two issues block inclusive usage and slow the first impression. Metadata and validation improvements can follow in the same release because they are low-risk changes with visible quality gains."}
                </p>
                <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-sm font-semibold">Next action</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    Create a ticket for each high-severity issue and attach the
                    screenshot, selector, and recommended fix.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}
