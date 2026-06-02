import { describe, expect, it } from "vitest";
import {
  buildControllerDesign,
  createControllerTf,
  DEFAULT_CONTROLLER_PARAMS,
} from "@/lib/controllerDesign";
import { format, poly } from "@/lib/polynomial";

describe("controller design math", () => {
  it("creates classical controller transfer functions from numeric parameters", () => {
    const params = { ...DEFAULT_CONTROLLER_PARAMS, kp: 2, ki: 4, kd: 0.5, gain: 3, zero: 2, pole: 8 };

    expect(format(createControllerTf("p", params).num)).toBe("2");
    expect(format(createControllerTf("pi", params).num)).toBe("2s + 4");
    expect(format(createControllerTf("pi", params).den)).toBe("s");
    expect(format(createControllerTf("pid", params).num)).toBe("0.5s² + 2s + 4");
    expect(format(createControllerTf("lead", params).num)).toBe("3s + 6");
    expect(format(createControllerTf("lead", params).den)).toBe("s + 8");
  });

  it("builds linked open-loop and closed-loop design models", () => {
    const plant = { num: poly([1]), den: poly([1, 1]) };
    const design = buildControllerDesign(plant, "p", {
      ...DEFAULT_CONTROLLER_PARAMS,
      kp: 2,
    });

    expect(design.openLoopResult.display).toEqual({ num: "2", den: "s + 1" });
    expect(design.closedLoopResult.display).toEqual({ num: "2", den: "s + 3" });
    expect(design.closedLoopResult.stability).toBe("stable");
  });
});
