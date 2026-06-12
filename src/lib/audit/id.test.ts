import { describe, expect, it } from "vitest";
import { isAuditId } from "./id";

describe("isAuditId", () => {
  it("accepts canonical UUIDs", () => {
    expect(isAuditId("9e09db39-501b-4160-841f-3fadb5983a06")).toBe(true);
    expect(isAuditId("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isAuditId("9E09DB39-501B-4160-841F-3FADB5983A06")).toBe(true); // case-insensitive
  });

  it("rejects non-UUID strings", () => {
    expect(isAuditId("not-a-uuid")).toBe(false);
    expect(isAuditId("")).toBe(false);
    expect(isAuditId("9e09db39-501b-4160-841f")).toBe(false); // too short
    expect(isAuditId("../../etc/passwd")).toBe(false);
    expect(isAuditId("zzzzzzzz-501b-4160-841f-3fadb5983a06")).toBe(false); // non-hex
  });
});
