import { test, expect } from "@playwright/test";

test("home page renders the audit dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("async audit completes and is served as a report + PDF", async ({ page, request }) => {
  // POST returns immediately with a queued record (async job model).
  const post = await request.post("/api/audits", {
    data: { url: "https://example.com", language: "en" },
  });
  expect(post.status()).toBe(202);
  const queued = await post.json();
  expect(queued.status).toBe("queued");

  // Poll the background job to a terminal state.
  let status = "queued";
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await request.get(`/api/audits?id=${queued.id}`);
    status = (await poll.json()).status;
    if (status === "completed" || status === "failed") break;
  }
  expect(status).toBe("completed");

  // The shareable report is a static shell that fetches its own record, so it
  // has to be driven in a browser rather than asserted on raw HTML.
  await page.goto(`/report/${queued.id}`);
  await expect(page.locator("[data-report-ready='true']")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("example.com");

  // PDF export returns a real downloadable PDF.
  const pdf = await request.get(`/pdf/${queued.id}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
