import { describe, expect, it } from "vitest";
import {
  buildAccessibilityIssues,
  countAxeImpacts,
  type AxeImpact,
  type AxeViolation,
} from "@/lib/audit/accessibility";
import { auditStrings } from "@/lib/audit/audit-i18n";

const en = auditStrings("en");

function violation(
  id: string,
  impact: AxeImpact | null,
  nodes = 1,
): AxeViolation {
  return {
    id,
    impact,
    help: `Help ${id}`,
    description: `Description ${id}`,
    helpUrl: `https://dequeuniversity.com/${id}`,
    nodes: Array.from({ length: nodes }, () => ({
      target: [`#${id}`],
      failureSummary: `Fix ${id}`,
    })),
  };
}

describe("countAxeImpacts", () => {
  it("tallies by impact and treats null impact as minor", () => {
    const counts = countAxeImpacts([
      violation("a", "critical"),
      violation("b", "serious"),
      violation("c", "minor"),
      violation("d", null),
    ]);
    expect(counts).toEqual({ critical: 1, serious: 1, moderate: 0, minor: 2 });
  });
});

describe("buildAccessibilityIssues", () => {
  it("maps a violation to a categorized issue", () => {
    const [issue] = buildAccessibilityIssues([violation("image-alt", "critical", 3)], en);
    expect(issue).toMatchObject({
      id: "a11y-image-alt",
      category: "Accessibility",
      severity: "High",
      title: "Help image-alt",
      selector: "#image-alt",
      fix: "Fix image-alt",
      helpUrl: "https://dequeuniversity.com/image-alt",
      impact: "critical",
    });
    expect(issue.detail).toContain("Description image-alt");
    expect(issue.detail).toContain("3");
  });

  it("maps impact to severity", () => {
    const issues = buildAccessibilityIssues(
      [violation("a", "critical"), violation("b", "moderate"), violation("c", "minor")],
      en,
    );
    const bySeverity = Object.fromEntries(issues.map((i) => [i.id, i.severity]));
    expect(bySeverity["a11y-a"]).toBe("High");
    expect(bySeverity["a11y-b"]).toBe("Medium");
    expect(bySeverity["a11y-c"]).toBe("Low");
  });

  it("falls back gracefully when a violation has no nodes", () => {
    const noNodes: AxeViolation = {
      id: "meta-viewport",
      impact: "critical",
      help: "Zoom must not be disabled",
      description: "Ensure the meta viewport allows zoom",
      helpUrl: "https://dequeuniversity.com/meta-viewport",
      nodes: [],
    };
    const [issue] = buildAccessibilityIssues([noNodes], en);
    expect(issue.selector).toBeUndefined();
    expect(issue.fix).toBe("Zoom must not be disabled"); // falls back to help
    expect(issue.detail).toContain("0");
  });

  it("sorts most severe first and caps the list", () => {
    const many: AxeViolation[] = [
      ...Array.from({ length: 30 }, (_, i) => violation(`minor-${i}`, "minor")),
      violation("crit", "critical"),
    ];
    const issues = buildAccessibilityIssues(many, en);
    expect(issues[0].id).toBe("a11y-crit");
    expect(issues.length).toBe(25);
  });
});
