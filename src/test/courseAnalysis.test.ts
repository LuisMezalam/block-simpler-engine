import { describe, expect, it } from "vitest";
import { poly, tf } from "@/lib/polynomial";
import { analyzeRouth, analyzeStaticError } from "@/lib/courseAnalysis";
import { solve } from "@/lib/solver";
import type { SolverResult } from "@/lib/solver";

describe("course analysis helpers", () => {
  it("marks a stable second-order characteristic equation with no Routh sign changes", () => {
    const routh = analyzeRouth(poly([2, 3, 1]));

    expect(routh.verdict).toBe("stable");
    expect(routh.signChanges).toBe(0);
    expect(routh.firstColumn.map((value) => Number(value.toFixed(6)))).toEqual([1, 3, 2]);
  });

  it("counts Routh sign changes for an unstable polynomial", () => {
    const routh = analyzeRouth(poly([1, -2, 1]));

    expect(routh.verdict).toBe("unstable");
    expect(routh.signChanges).toBe(2);
  });

  it("computes unity-feedback static error constants from loop gain", () => {
    const result = solve("unity_feedback", [
      { id: "g", label: "G", numStr: "10", denStr: "s^2 + 2s" },
    ]);
    const analysis = analyzeStaticError(result);

    expect(analysis.systemType).toBe(1);
    expect(analysis.constants.kp).toBe("infinity");
    expect(analysis.constants.kv).toBeCloseTo(5);
    expect(analysis.constants.ka).toBe(0);
    expect(analysis.errors.step).toBe(0);
    expect(analysis.errors.ramp).toBeCloseTo(0.2);
    expect(analysis.errors.parabolic).toBe("infinity");
  });

  it("uses net uncancelled origin poles for system type", () => {
    const fakeResult = {
      connectionType: "series",
      blocks: [],
      equivalentTF: tf(poly([0, 2]), poly([0, 0, 1])),
      formula: "",
      derivation: [],
      display: { num: "", den: "" },
      poles: [],
      zeros: [],
      stability: "unknown",
      charEq: "",
    } as SolverResult;

    const analysis = analyzeStaticError(fakeResult);
    expect(analysis.systemType).toBe(1);
  });
});
