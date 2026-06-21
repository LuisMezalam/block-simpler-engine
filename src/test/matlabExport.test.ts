import { describe, expect, it } from "vitest";
import { DEFAULT_CONTROLLER_PARAMS } from "@/lib/controllerDesign";
import {
  controllerMatlabExpression,
  generateMatlabControlScript,
  matlabCoeffVector,
} from "@/lib/matlabExport";
import { poly } from "@/lib/polynomial";

describe("MATLAB export bridge", () => {
  it("formats ascending internal polynomial coefficients for MATLAB tf", () => {
    expect(matlabCoeffVector([2, 3, 1])).toBe("[1 3 2]");
    expect(matlabCoeffVector([0, 0.5, -2])).toBe("[-2 0.5 0]");
  });

  it("generates Control System Toolbox controller expressions", () => {
    const params = { ...DEFAULT_CONTROLLER_PARAMS, kp: 2, ki: 4, kd: 0.25, gain: 3, zero: 1, pole: 8 };

    expect(controllerMatlabExpression("pid", params)).toBe("C = pid(2, 4, 0.25);");
    expect(controllerMatlabExpression("lead", params)).toBe("C = 3 * tf([1 1], [1 8]);");
  });

  it("exports a runnable MATLAB validation script with designer fallbacks", () => {
    const script = generateMatlabControlScript({
      plant: { num: poly([4]), den: poly([4, 2, 1]) },
      controllerKind: "pi",
      params: { ...DEFAULT_CONTROLLER_PARAMS, kp: 2, ki: 1 },
      openDesigner: false,
    });

    expect(script).toContain("G = tf([4], [1 2 4]);");
    expect(script).toContain("C = pid(2, 1, 0);");
    expect(script).toContain("L = minreal(C * G);");
    expect(script).toContain("T = minreal(feedback(L, 1));");
    expect(script).toContain("controlSystemDesigner(L);");
    expect(script).toContain("rltool(L);");
    expect(script).toContain("openInteractiveDesigner = false;");
  });
});
