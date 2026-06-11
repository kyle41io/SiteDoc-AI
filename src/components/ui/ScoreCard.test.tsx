import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreCard } from "@/components/ui/ScoreCard";

describe("ScoreCard", () => {
  it("renders the label", () => {
    render(<ScoreCard label="Accessibility" value={88} />);
    expect(screen.getByText("Accessibility")).toBeInTheDocument();
  });

  it("shows '--' when no value is provided", () => {
    render(<ScoreCard label="SEO" />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("clamps the displayed value into 0-100", () => {
    const { rerender } = render(<ScoreCard label="Perf" value={130} />);
    expect(screen.getByText("100")).toBeInTheDocument();

    rerender(<ScoreCard label="Perf" value={-5} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
