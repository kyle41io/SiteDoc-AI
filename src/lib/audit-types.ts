export type AuditStatus = "running" | "completed" | "failed";

export type AuditCategory = "Scanner" | "Console" | "Network";

export type AuditSeverity = "High" | "Medium" | "Low";

export type AuditIssue = {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  selector: string;
  detail: string;
  fix: string;
};

export type ConsoleError = {
  text: string;
  type: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type FailedRequest = {
  url: string;
  method: string;
  resourceType: string;
  failureText: string;
  status?: number;
};

export type AuditMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AuditScreenshots = {
  desktop?: string;
  mobile?: string;
};

export type AuditRecord = {
  id: string;
  url: string;
  finalUrl?: string;
  status: AuditStatus;
  createdAt: string;
  completedAt?: string;
  error?: string;
  durationMs?: number;
  screenshots: AuditScreenshots;
  consoleErrors: ConsoleError[];
  failedRequests: FailedRequest[];
  issues: AuditIssue[];
  metrics: AuditMetric[];
  scores: {
    overall: number;
    scanner: number;
    console: number;
    network: number;
  };
  summary: string;
};
