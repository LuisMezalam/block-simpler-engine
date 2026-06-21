import type { TypedTF } from "./polynomial";
import type { ControllerKind, ControllerParams } from "./controllerDesign";

export type MatlabExportOptions = {
  plant: TypedTF;
  controllerKind: ControllerKind;
  params: ControllerParams;
  openDesigner?: boolean;
};

export function matlabCoeffVector(coeffs: readonly number[]): string {
  const descending = [...coeffs].reverse().map((coefficient) => {
    const clean = Math.abs(coefficient) < 1e-12 ? 0 : coefficient;
    return Number(clean.toPrecision(12)).toString();
  });
  return `[${descending.join(" ")}]`;
}

export function controllerMatlabExpression(kind: ControllerKind, params: ControllerParams): string {
  switch (kind) {
    case "none":
      return "C = tf(1, 1);";
    case "p":
      return `C = pid(${formatNumber(params.kp)}, 0, 0);`;
    case "pi":
      return `C = pid(${formatNumber(params.kp)}, ${formatNumber(params.ki)}, 0);`;
    case "pd":
      return `C = pid(${formatNumber(params.kp)}, 0, ${formatNumber(params.kd)});`;
    case "pid":
      return `C = pid(${formatNumber(params.kp)}, ${formatNumber(params.ki)}, ${formatNumber(params.kd)});`;
    case "lead":
    case "lag":
      return `C = ${formatNumber(params.gain)} * tf([1 ${formatNumber(params.zero)}], [1 ${formatNumber(params.pole)}]);`;
  }
}

export function generateMatlabControlScript({
  plant,
  controllerKind,
  params,
  openDesigner = true,
}: MatlabExportOptions): string {
  const lines = [
    "%% Block Diagram Simplifier - MATLAB Control System Toolbox validation",
    "% Copy this script into MATLAB, or save it as block_simplifier_design.m.",
    "% It recreates the plant/controller pair and opens the standard analysis views.",
    "",
    "clear; close all; clc;",
    "s = tf('s'); %#ok<NASGU>",
    "",
    `G = tf(${matlabCoeffVector(plant.num.coeffs)}, ${matlabCoeffVector(plant.den.coeffs)});`,
    controllerMatlabExpression(controllerKind, params),
    "L = minreal(C * G);",
    "T = minreal(feedback(L, 1));",
    "",
    "disp('Plant G(s):');",
    "G",
    "disp('Controller C(s):');",
    "C",
    "disp('Open-loop L(s) = C(s)G(s):');",
    "L",
    "disp('Closed-loop T(s) = feedback(L, 1):');",
    "T",
    "",
    "figure('Name', 'Block Diagram Simplifier - Control Analysis');",
    "tiledlayout(2, 3, 'TileSpacing', 'compact', 'Padding', 'compact');",
    "nexttile; pzmap(T); grid on; title('Closed-loop pole-zero');",
    "nexttile; step(T); grid on; title('Step response');",
    "nexttile; bode(L); grid on; title('Bode L(s)');",
    "nexttile; nyquist(L); grid on; title('Nyquist L(s)');",
    "nexttile; nichols(L); grid on; title('Nichols L(s)');",
    "nexttile; rlocus(L); grid on; title('Root locus L(s)');",
    "",
    "try",
    "    info = stepinfo(T);",
    "    disp('Closed-loop step metrics:');",
    "    disp(info);",
    "catch stepInfoError",
    "    warning('Step metrics unavailable: %s', stepInfoError.message);",
    "end",
    "",
    "try",
    "    [gm, pm, wcg, wcp] = margin(L);",
    "    fprintf('Gain margin: %g (%g dB) at w = %g rad/s\\n', gm, 20*log10(gm), wcg);",
    "    fprintf('Phase margin: %g deg at w = %g rad/s\\n', pm, wcp);",
    "catch marginError",
    "    warning('Margin calculation unavailable: %s', marginError.message);",
    "end",
    "",
    `openInteractiveDesigner = ${openDesigner ? "true" : "false"};`,
    "if openInteractiveDesigner",
    "    try",
    "        controlSystemDesigner(L);",
    "    catch designerError",
    "        warning('controlSystemDesigner unavailable: %s', designerError.message);",
    "        if exist('rltool', 'file') == 2",
    "            rltool(L);",
    "        end",
    "    end",
    "end",
    "",
  ];

  return lines.join("\n");
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const clean = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(clean.toPrecision(12)).toString();
}
