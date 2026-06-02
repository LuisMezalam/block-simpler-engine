import { describe, expect, it } from "vitest";
import { parsePoly } from "@/lib/polynomial";
import { solve } from "@/lib/solver";
import { CATEGORY_META, IDENTITIES } from "@/lib/identities";
import {
  analyzeDiagram,
  createFeedbackTemplate,
  createParallelTemplate,
  createSeriesTemplate,
  type DiagramState,
} from "@/lib/diagramEngine";

describe("system audit coverage", () => {
  it("requires every library identity to declare implementation coverage", () => {
    expect(IDENTITIES.every((identity) => identity.support)).toBe(true);
    expect(IDENTITIES.filter((identity) => identity.support === "live").length).toBeGreaterThan(0);
    expect(IDENTITIES.filter((identity) => identity.support === "reference").length).toBeGreaterThan(0);
  });

  it("includes controller identities from the course design slides", () => {
    const controllerIds = IDENTITIES
      .filter((identity) => identity.category === "controllers")
      .map((identity) => identity.id);

    expect(CATEGORY_META.controllers.label).toBe("Controllers");
    expect(controllerIds).toEqual(expect.arrayContaining([
      "proportional_control",
      "integral_control",
      "derivative_control",
      "pi_controller",
      "pd_controller",
      "pid_controller",
      "lag_compensator",
      "lead_compensator",
      "lead_lag_compensator",
    ]));
  });

  it("parses tuned symbolic preset expressions instead of collapsing them to placeholders", () => {
    expect(parsePoly("2*0.5*2*s + 2^2").coeffs).toEqual([4, 2]);
    expect(parsePoly("1*s+1").coeffs).toEqual([1, 1]);
    expect(parsePoly("-s+2/1").coeffs).toEqual([2, -1]);
  });

  it("rejects unresolved symbolic transfer functions before analysis", () => {
    expect(() => parsePoly("K")).toThrow(/symbolic/);

    const diagram: DiagramState = {
      nodes: [
        { id: "in", type: "input", x: 0, y: 0, label: "U(s)" },
        { id: "g", type: "block", x: 100, y: 0, label: "K", tf: { num: "K", den: "1" } },
        { id: "out", type: "output", x: 220, y: 0, label: "C(s)" },
      ],
      edges: [
        { id: "e1", from: "in", to: "g" },
        { id: "e2", from: "g", to: "out" },
      ],
    };

    expect(analyzeDiagram(diagram)).toMatchObject({
      topology: "unknown",
      error: expect.stringMatching(/symbolic/),
    });
  });

  it("solves core calculator identities with exact displayed transfer functions", () => {
    const series = solve("series", [
      { id: "g1", label: "G1", numStr: "1", denStr: "s + 1" },
      { id: "g2", label: "G2", numStr: "2", denStr: "s + 2" },
    ]);
    expect(series.display).toEqual({ num: "2", den: "s² + 3s + 2" });

    const parallel = solve("parallel", [
      { id: "p", label: "P", numStr: "2", denStr: "1" },
      { id: "i", label: "I", numStr: "1", denStr: "s" },
    ]);
    expect(parallel.display).toEqual({ num: "2s + 1", den: "s" });

    const unity = solve("unity_feedback", [
      { id: "g", label: "G", numStr: "4", denStr: "s^2 + 2s" },
    ]);
    expect(unity.display).toEqual({ num: "4", den: "s² + 2s + 4" });
  });

  it("analyzes the shipped diagram templates", () => {
    expect(analyzeDiagram(createSeriesTemplate())).toMatchObject({
      topology: "series",
      result: { display: { num: "2", den: "s² + 3s + 2" } },
    });
    expect(analyzeDiagram(createParallelTemplate())).toMatchObject({
      topology: "parallel",
      result: { display: { num: "2s + 1", den: "s" } },
    });
    expect(analyzeDiagram(createFeedbackTemplate())).toMatchObject({
      topology: "feedback_negative",
      result: { display: { num: "10", den: "s² + 3s + 12" } },
    });
  });

  it("honors negative signs on direct parallel summing branches", () => {
    const diagram = createParallelTemplate();
    const sum = diagram.nodes.find((node) => node.id === "sum");
    if (sum) sum.signs = { e5: "-" };

    expect(analyzeDiagram(diagram)).toMatchObject({
      topology: "parallel",
      result: { display: { num: "2s - 1", den: "s" } },
    });
  });
});
