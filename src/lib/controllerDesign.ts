import type { SolverResult } from "./solver";
import {
  add,
  format,
  mul,
  ONE,
  poly,
  roots,
  simplifyTF,
  type TypedTF,
} from "./polynomial";

export type ControllerKind = "none" | "p" | "pi" | "pd" | "pid" | "lead" | "lag";

export type ControllerParams = {
  kp: number;
  ki: number;
  kd: number;
  gain: number;
  zero: number;
  pole: number;
};

export type ControllerSpec = {
  kind: ControllerKind;
  label: string;
  shortLabel: string;
  purpose: string;
  formula: string;
  useWhen: string;
};

export const DEFAULT_CONTROLLER_PARAMS: ControllerParams = {
  kp: 1,
  ki: 0.5,
  kd: 0.1,
  gain: 1,
  zero: 1,
  pole: 5,
};

export const CONTROLLER_SPECS: ControllerSpec[] = [
  {
    kind: "none",
    label: "No Compensator",
    shortLabel: "G",
    purpose: "Study the analyzed plant or equivalent model directly.",
    formula: "C(s) = 1",
    useWhen: "Baseline model review before adding controller dynamics.",
  },
  {
    kind: "p",
    label: "Proportional",
    shortLabel: "P",
    purpose: "Move along the current root locus with a single gain.",
    formula: "C(s) = Kp",
    useWhen: "Use first when the desired pole location already lies on the locus.",
  },
  {
    kind: "pi",
    label: "PI",
    shortLabel: "PI",
    purpose: "Improve steady-state error by adding an integrator and controller zero.",
    formula: "C(s) = Kp + Ki/s",
    useWhen: "Use for steady-state accuracy after checking transient impact.",
  },
  {
    kind: "pd",
    label: "PD",
    shortLabel: "PD",
    purpose: "Add phase lead-like behavior with a controller zero.",
    formula: "C(s) = Kp + Kd*s",
    useWhen: "Use for faster, better damped transients when noise is manageable.",
  },
  {
    kind: "pid",
    label: "PID",
    shortLabel: "PID",
    purpose: "Combine integral accuracy with derivative phase shaping.",
    formula: "C(s) = Kp + Ki/s + Kd*s",
    useWhen: "Use when both transient and steady-state specs matter.",
  },
  {
    kind: "lead",
    label: "Lead",
    shortLabel: "Lead",
    purpose: "Add positive phase and improve phase margin or transient response.",
    formula: "C(s) = K*(s+z)/(s+p), p > z",
    useWhen: "Use for root-locus angle deficiency or frequency-domain phase margin.",
  },
  {
    kind: "lag",
    label: "Lag",
    shortLabel: "Lag",
    purpose: "Raise low-frequency loop gain while limiting dominant pole movement.",
    formula: "C(s) = K*(s+z)/(s+p), z > p",
    useWhen: "Use for steady-state error improvement with minimal transient change.",
  },
];

export function controllerSpecFor(kind: ControllerKind): ControllerSpec {
  return CONTROLLER_SPECS.find((spec) => spec.kind === kind) ?? CONTROLLER_SPECS[0];
}

export function createControllerTf(kind: ControllerKind, params: ControllerParams): TypedTF {
  const kp = finiteOrDefault(params.kp, DEFAULT_CONTROLLER_PARAMS.kp);
  const ki = finiteOrDefault(params.ki, DEFAULT_CONTROLLER_PARAMS.ki);
  const kd = finiteOrDefault(params.kd, DEFAULT_CONTROLLER_PARAMS.kd);
  const gain = finiteOrDefault(params.gain, DEFAULT_CONTROLLER_PARAMS.gain);
  const zero = Math.max(1e-6, finiteOrDefault(params.zero, DEFAULT_CONTROLLER_PARAMS.zero));
  const pole = Math.max(1e-6, finiteOrDefault(params.pole, DEFAULT_CONTROLLER_PARAMS.pole));

  switch (kind) {
    case "none":
      return { num: ONE, den: ONE };
    case "p":
      return { num: poly([kp]), den: ONE };
    case "pi":
      return simplifyTF({ num: poly([ki, kp]), den: poly([0, 1]) });
    case "pd":
      return simplifyTF({ num: poly([kp, kd]), den: ONE });
    case "pid":
      return simplifyTF({ num: poly([ki, kp, kd]), den: poly([0, 1]) });
    case "lead":
      return simplifyTF({ num: poly([gain * zero, gain]), den: poly([pole, 1]) });
    case "lag":
      return simplifyTF({ num: poly([gain * zero, gain]), den: poly([pole, 1]) });
  }
}

export function multiplyTf(a: TypedTF, b: TypedTF): TypedTF {
  return simplifyTF({
    num: mul(a.num, b.num),
    den: mul(a.den, b.den),
  });
}

export function unityFeedbackTf(loopTf: TypedTF): TypedTF {
  return simplifyTF({
    num: loopTf.num,
    den: add(loopTf.den, loopTf.num),
  });
}

export function createResultFromTf(
  tf: TypedTF,
  label: string,
  formula: string,
  derivation: string[] = []
): SolverResult {
  const simplified = simplifyTF(tf);
  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);

  return {
    connectionType: "unity_feedback",
    blocks: [
      {
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label,
        numStr: format(simplified.num),
        denStr: format(simplified.den),
        tf: simplified,
      },
    ],
    equivalentTF: simplified,
    formula,
    derivation,
    display: { num: format(simplified.num), den: format(simplified.den) },
    poles,
    zeros,
    stability: assessPoleStability(poles),
    charEq: `${format(simplified.den)} = 0`,
  };
}

export function buildControllerDesign(
  plant: TypedTF,
  kind: ControllerKind,
  params: ControllerParams
) {
  const controller = createControllerTf(kind, params);
  const openLoop = multiplyTf(controller, plant);
  const closedLoop = unityFeedbackTf(openLoop);
  const spec = controllerSpecFor(kind);

  return {
    controller,
    openLoop,
    closedLoop,
    spec,
    openLoopResult: createResultFromTf(
      openLoop,
      "L",
      "Open-loop L(s) = C(s)G(s)",
      [
        `Controller: ${spec.formula}`,
        "Loop transfer function: L(s) = C(s)G(s)",
        "Bode, Nyquist, Nichols, and root-locus plots use this open-loop model.",
      ]
    ),
    closedLoopResult: createResultFromTf(
      closedLoop,
      "T",
      "Closed-loop T(s) = C(s)G(s) / [1 + C(s)G(s)]",
      [
        `Controller: ${spec.formula}`,
        "Assumed architecture: unity negative feedback around C(s)G(s).",
        "Pole-zero and step response views use this closed-loop model.",
      ]
    ),
  };
}

function finiteOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function assessPoleStability(
  poles: Array<{ re: number; im: number }>
): SolverResult["stability"] {
  if (poles.length === 0) return "stable";
  if (poles.some((pole) => Number.isNaN(pole.re))) return "unknown";
  const maxReal = Math.max(...poles.map((pole) => pole.re));
  if (maxReal > 1e-8) return "unstable";
  if (Math.abs(maxReal) <= 1e-8) return "marginally_stable";
  return "stable";
}
