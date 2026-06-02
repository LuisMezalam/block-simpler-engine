import type { Poly, TypedTF } from "./polynomial";
import { degree, format, mul, simplifyTF } from "./polynomial";
import type { SolverResult } from "./solver";

const EPS = 1e-9;
const ROUTH_EPS = 1e-6;

export type LimitValue = number | "infinity" | "undefined";

export type StaticErrorAnalysis = {
  loopGain: TypedTF;
  loopLabel: string;
  systemType: number;
  constants: {
    kp: LimitValue;
    kv: LimitValue;
    ka: LimitValue;
  };
  errors: {
    step: LimitValue;
    ramp: LimitValue;
    parabolic: LimitValue;
  };
  notes: string[];
};

export type RouthAnalysis = {
  polynomial: string;
  degree: number;
  rows: Array<{ power: number; values: number[] }>;
  firstColumn: number[];
  signChanges: number;
  verdict: "stable" | "unstable" | "special" | "constant";
  notes: string[];
};

export type CourseAnalysis = {
  routh: RouthAnalysis;
  staticError: StaticErrorAnalysis;
};

function lowestNonZeroPower(p: Poly): number | null {
  for (let i = 0; i < p.coeffs.length; i++) {
    if (Math.abs(p.coeffs[i] ?? 0) > EPS) return i;
  }
  return null;
}

function limitAtZero(tf: TypedTF, sPower: number): LimitValue {
  const numPower = lowestNonZeroPower(tf.num);
  const denPower = lowestNonZeroPower(tf.den);

  if (denPower === null) return "undefined";
  if (numPower === null) return 0;

  const numeratorOrder = numPower + sPower;
  if (numeratorOrder < denPower) return "infinity";
  if (numeratorOrder > denPower) return 0;

  const numeratorCoeff = tf.num.coeffs[numPower] ?? 0;
  const denominatorCoeff = tf.den.coeffs[denPower] ?? 0;
  if (Math.abs(denominatorCoeff) < EPS) return "undefined";
  return numeratorCoeff / denominatorCoeff;
}

function reciprocal(value: LimitValue): LimitValue {
  if (value === "undefined") return "undefined";
  if (value === "infinity") return 0;
  if (Math.abs(value) < EPS) return "infinity";
  return 1 / value;
}

function stepError(kp: LimitValue): LimitValue {
  if (kp === "undefined") return "undefined";
  if (kp === "infinity") return 0;
  const denominator = 1 + kp;
  if (Math.abs(denominator) < EPS) return "infinity";
  return 1 / denominator;
}

function getLoopGain(result: SolverResult): { tf: TypedTF; label: string } {
  if (result.connectionType === "unity_feedback") {
    return { tf: result.blocks[0].tf, label: "L(s) = G(s)" };
  }

  if (
    (result.connectionType === "feedback_negative" ||
      result.connectionType === "feedback_positive") &&
    result.feedbackBlock
  ) {
    return {
      tf: simplifyTF({
        num: mul(result.blocks[0].tf.num, result.feedbackBlock.tf.num),
        den: mul(result.blocks[0].tf.den, result.feedbackBlock.tf.den),
      }),
      label: "L(s) = G(s)H(s)",
    };
  }

  return {
    tf: result.equivalentTF,
    label: "L(s) = G_eq(s) as a unity-feedback forward path",
  };
}

export function analyzeStaticError(result: SolverResult): StaticErrorAnalysis {
  const { tf, label } = getLoopGain(result);
  const numOriginZeros = lowestNonZeroPower(tf.num) ?? 0;
  const denOriginPoles = lowestNonZeroPower(tf.den) ?? 0;
  const systemType = Math.max(0, denOriginPoles - numOriginZeros);

  const kp = limitAtZero(tf, 0);
  const kv = limitAtZero(tf, 1);
  const ka = limitAtZero(tf, 2);

  const notes = [
    "System type is the number of uncancelled open-loop poles at the origin.",
    "For unity negative feedback: e_step = 1/(1+Kp), e_ramp = 1/Kv, e_parabolic = 1/Ka.",
  ];

  if (result.connectionType === "series" || result.connectionType === "parallel") {
    notes.push("This uses the simplified result as a forward path inside a hypothetical unity-feedback loop.");
  }

  if (result.connectionType === "feedback_positive") {
    notes.push("Positive feedback is not the normal static-error setup; treat these constants as loop-gain diagnostics.");
  }

  return {
    loopGain: tf,
    loopLabel: label,
    systemType,
    constants: { kp, kv, ka },
    errors: {
      step: stepError(kp),
      ramp: reciprocal(kv),
      parabolic: reciprocal(ka),
    },
    notes,
  };
}

function descendingCoefficients(p: Poly): number[] {
  const values: number[] = [];
  for (let i = degree(p); i >= 0; i--) {
    values.push(Math.abs(p.coeffs[i] ?? 0) < EPS ? 0 : p.coeffs[i] ?? 0);
  }
  return values;
}

function isZeroRow(row: number[]): boolean {
  return row.every((value) => Math.abs(value) < EPS);
}

function auxiliaryDerivativeRow(previousRow: number[], previousPower: number, columns: number[]): number[] {
  return columns.map((_, index) => {
    const power = previousPower - 2 * index;
    return power > 0 ? previousRow[index] * power : 0;
  });
}

function countSignChanges(values: number[]): number {
  const signs = values
    .filter((value) => Math.abs(value) > EPS)
    .map((value) => Math.sign(value));

  let changes = 0;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) changes++;
  }
  return changes;
}

export function analyzeRouth(poly: Poly): RouthAnalysis {
  const n = degree(poly);
  const notes: string[] = [];

  if (n === 0) {
    return {
      polynomial: format(poly),
      degree: n,
      rows: [{ power: 0, values: [poly.coeffs[0] ?? 0] }],
      firstColumn: [poly.coeffs[0] ?? 0],
      signChanges: 0,
      verdict: "constant",
      notes: ["A constant denominator has no dynamic poles."],
    };
  }

  const desc = descendingCoefficients(poly);
  const columnCount = Math.ceil((n + 1) / 2);
  const table = Array.from({ length: n + 1 }, () => new Array(columnCount).fill(0));

  for (let i = 0; i < columnCount; i++) {
    table[0][i] = desc[2 * i] ?? 0;
    table[1][i] = desc[2 * i + 1] ?? 0;
  }

  for (let row = 2; row <= n; row++) {
    if (isZeroRow(table[row - 1])) {
      const previousPower = n - (row - 2);
      table[row - 1] = auxiliaryDerivativeRow(table[row - 2], previousPower, table[row - 1]);
      notes.push(`Row s^${n - (row - 1)} was zero; used the auxiliary polynomial derivative.`);
    }

    let pivot = table[row - 1][0];
    if (Math.abs(pivot) < EPS) {
      pivot = ROUTH_EPS;
      table[row - 1][0] = pivot;
      notes.push(`First element in row s^${n - (row - 1)} was zero; used epsilon for the Routh array.`);
    }

    for (let col = 0; col < columnCount - 1; col++) {
      table[row][col] =
        (pivot * table[row - 2][col + 1] - table[row - 2][0] * table[row - 1][col + 1]) /
        pivot;
      if (Math.abs(table[row][col]) < EPS) table[row][col] = 0;
    }

    if (isZeroRow(table[row])) {
      const previousPower = n - (row - 1);
      table[row] = auxiliaryDerivativeRow(table[row - 1], previousPower, table[row]);
      notes.push(`Row s^${n - row} was zero; used the auxiliary polynomial derivative.`);
    }
  }

  const rows = table.map((values, index) => ({ power: n - index, values }));
  const firstColumn = rows.map((row) => row.values[0]);
  const signChanges = countSignChanges(firstColumn);
  const hasSpecialCase = notes.length > 0;
  const verdict = signChanges > 0 ? "unstable" : hasSpecialCase ? "special" : "stable";

  if (signChanges > 0) {
    notes.push(`${signChanges} sign change(s) in the first column indicate right-half-plane pole(s).`);
  } else if (!hasSpecialCase) {
    notes.push("No sign changes in the first column: Routh-Hurwitz predicts left-half-plane poles.");
  } else {
    notes.push("Special Routh case detected; inspect roots or the auxiliary polynomial for imaginary-axis behavior.");
  }

  return {
    polynomial: format(poly),
    degree: n,
    rows,
    firstColumn,
    signChanges,
    verdict,
    notes,
  };
}

export function analyzeCourseChecks(result: SolverResult): CourseAnalysis {
  return {
    routh: analyzeRouth(result.equivalentTF.den),
    staticError: analyzeStaticError(result),
  };
}

export function formatCourseValue(value: LimitValue, digits = 4): string {
  if (value === "infinity") return "inf";
  if (value === "undefined") return "n/a";
  if (!Number.isFinite(value)) return "inf";
  if (Math.abs(value) < EPS) return "0";
  return Number(value.toFixed(digits)).toString();
}
