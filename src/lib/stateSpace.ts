/**
 * State-Space to Transfer Function Converter
 * ============================================
 * Converts SISO state-space representations (A, B, C, D) to transfer functions.
 *
 * Standard form:
 *   ẋ(t) = A·x(t) + B·u(t)
 *   y(t) = C·x(t) + D·u(t)
 *
 * Transfer function (Laplace domain):
 *   G(s) = C·(sI - A)⁻¹·B + D
 *        = [C·adj(sI - A)·B + D·det(sI - A)] / det(sI - A)
 *
 * Reference: Ogata §3-3, Franklin §7.1, Nise Appendix A
 */

import {
  Poly, TypedTF, poly, constant, ZERO, ONE,
  add, sub, mul, scale, addAll, mulAll, format, simplifyTF, degree,
  roots, formatRoot, monic,
} from "./polynomial";

// ─── Matrix types ────────────────────────────────────────────────────────────

/** Real matrix (n×m) stored row-major */
export type Matrix = {
  readonly rows: number;
  readonly cols: number;
  readonly data: readonly (readonly number[])[];
};

/** Polynomial-entry matrix (n×m) — used to represent (sI - A) symbolically */
type PolyMatrix = {
  rows: number;
  cols: number;
  data: Poly[][];
};

// ─── State-space descriptor ──────────────────────────────────────────────────

export type StateSpaceSystem = {
  /** System matrix n×n */
  A: Matrix;
  /** Input matrix n×p */
  B: Matrix;
  /** Output matrix q×n */
  C: Matrix;
  /** Feedthrough matrix q×p */
  D: Matrix;
  /** Optional system name */
  label?: string;
};

export type SSConversionResult = {
  system: StateSpaceSystem;
  /** G(s) = num/den as typed polynomials */
  tf: TypedTF;
  /** Characteristic polynomial det(sI-A) */
  charPoly: Poly;
  /** Open-loop poles = eigenvalues of A */
  poles: Array<{ re: number; im: number }>;
  /** Transfer function zeros */
  zeros: Array<{ re: number; im: number }>;
  /** Step-by-step derivation */
  derivation: string[];
  /** Formatted num/den strings */
  display: { num: string; den: string };
};

// ─── Matrix arithmetic ───────────────────────────────────────────────────────

export function matMake(rows: number, cols: number, data: number[][]): Matrix {
  return { rows, cols, data };
}

function matGet(m: Matrix, i: number, j: number): number {
  return m.data[i]?.[j] ?? 0;
}

function polyMatGet(m: PolyMatrix, i: number, j: number): Poly {
  return m.data[i]?.[j] ?? ZERO;
}

/** Build (sI - A) as a polynomial matrix */
function buildSIA(A: Matrix): PolyMatrix {
  const n = A.rows;
  const data: Poly[][] = Array.from({ length: n }, () => Array(n).fill(ZERO));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        // s - a_ii  →  poly([-a_ii, 1])
        data[i][j] = poly([-matGet(A, i, j), 1]);
      } else {
        // -a_ij  →  poly([-a_ij])
        const v = -matGet(A, i, j);
        data[i][j] = Math.abs(v) < 1e-12 ? ZERO : poly([v]);
      }
    }
  }
  return { rows: n, cols: n, data };
}

/** Polynomial matrix determinant (recursive Leibniz/cofactor for n ≤ 8) */
function polyMatDet(m: PolyMatrix): Poly {
  const n = m.rows;
  if (n === 1) return polyMatGet(m, 0, 0);
  if (n === 2) {
    // ad - bc
    return sub(
      mul(polyMatGet(m, 0, 0), polyMatGet(m, 1, 1)),
      mul(polyMatGet(m, 0, 1), polyMatGet(m, 1, 0))
    );
  }
  // Cofactor expansion along first row
  let det: Poly = ZERO;
  for (let j = 0; j < n; j++) {
    const minor = polyMatMinor(m, 0, j);
    const cofactor = mul(polyMatGet(m, 0, j), polyMatDet(minor));
    if (j % 2 === 0) {
      det = add(det, cofactor);
    } else {
      det = sub(det, cofactor);
    }
  }
  return det;
}

/** Submatrix with row r and col c removed */
function polyMatMinor(m: PolyMatrix, r: number, c: number): PolyMatrix {
  const data: Poly[][] = [];
  for (let i = 0; i < m.rows; i++) {
    if (i === r) continue;
    const row: Poly[] = [];
    for (let j = 0; j < m.cols; j++) {
      if (j === c) continue;
      row.push(polyMatGet(m, i, j));
    }
    data.push(row);
  }
  return { rows: m.rows - 1, cols: m.cols - 1, data };
}

/** Adjugate (classical adjoint) of a polynomial matrix = transpose of cofactor matrix */
function polyMatAdj(m: PolyMatrix): PolyMatrix {
  const n = m.rows;
  const data: Poly[][] = Array.from({ length: n }, () => Array(n).fill(ZERO));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = polyMatMinor(m, j, i); // transposed indices
      const cof = polyMatDet(minor);
      data[i][j] = (i + j) % 2 === 0 ? cof : scale(cof, -1);
    }
  }
  return { rows: n, cols: n, data };
}

/** Multiply poly-matrix by a numeric vector (n×1), returning a poly vector */
function polyMatVecMul(m: PolyMatrix, v: number[]): Poly[] {
  const result: Poly[] = Array(m.rows).fill(ZERO);
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) {
      result[i] = add(result[i], scale(polyMatGet(m, i, j), v[j]));
    }
  }
  return result;
}

/** Dot product of a numeric vector with a poly vector (scalar output) */
function vecDotPoly(v: number[], p: Poly[]): Poly {
  let acc: Poly = ZERO;
  for (let i = 0; i < v.length; i++) {
    acc = add(acc, scale(p[i], v[i]));
  }
  return acc;
}

// ─── Main Conversion ─────────────────────────────────────────────────────────

/**
 * Convert SISO state-space system to transfer function.
 * Assumes first input (col 0 of B) and first output (row 0 of C, scalar D[0][0]).
 *
 * G(s) = C(sI-A)⁻¹B + D
 *       = [C·adj(sI-A)·B + D·det(sI-A)] / det(sI-A)
 */
export function stateSpaceToTF(sys: StateSpaceSystem): SSConversionResult {
  const n = sys.A.rows;
  const derivation: string[] = [];

  derivation.push(`System order n = ${n}`);
  derivation.push(`A ∈ ℝ^{${n}×${n}}, B ∈ ℝ^{${n}×1}, C ∈ ℝ^{1×${n}}, D ∈ ℝ^{1×1}`);
  derivation.push(`G(s) = C(sI - A)⁻¹B + D`);

  // Step 1: Build (sI - A)
  const sIA = buildSIA(sys.A);
  derivation.push(`Step 1: Build (sI - A) — polynomial ${n}×${n} matrix`);

  // Step 2: det(sI - A) = characteristic polynomial
  const charPoly = polyMatDet(sIA);
  derivation.push(`Step 2: det(sI - A) = ${format(charPoly)} (characteristic polynomial)`);

  // Step 3: adj(sI - A)
  const adjSIA = n === 1
    ? { rows: 1, cols: 1, data: [[ONE]] }
    : polyMatAdj(sIA);
  derivation.push(`Step 3: Compute adj(sI - A) = cofactor matrix transposed`);

  // Step 4: adj(sI-A)·B  →  extract column 0 of B
  const bCol = Array.from({ length: n }, (_, i) => matGet(sys.B, i, 0));
  const adjB = polyMatVecMul(adjSIA, bCol);
  derivation.push(`Step 4: adj(sI - A)·B → polynomial vector of length ${n}`);

  // Step 5: C·adj(sI-A)·B  (scalar) — use row 0 of C
  const cRow = Array.from({ length: n }, (_, j) => matGet(sys.C, 0, j));
  const numWithoutD = vecDotPoly(cRow, adjB);
  derivation.push(`Step 5: C·[adj(sI-A)·B] = ${format(numWithoutD)}`);

  // Step 6: D·det(sI-A) + C·adj·B
  const d00 = matGet(sys.D, 0, 0);
  const dTerm = scale(charPoly, d00);
  const numPoly = add(numWithoutD, dTerm);
  derivation.push(`Step 6: Numerator = C·adj·B + D·det(sI-A) = ${format(numPoly)}`);

  // Step 7: Simplify G(s) = numPoly / charPoly
  const rawTF: TypedTF = { num: numPoly, den: charPoly };
  const simplified = simplifyTF(rawTF);
  derivation.push(`Step 7: G(s) = [${format(simplified.num)}] / [${format(simplified.den)}]`);

  // Compute poles (eigenvalues of A = roots of charPoly)
  const poles = computePoles(charPoly);
  const poleStr = poles.map(formatRoot).join(", ");
  derivation.push(`Open-loop poles (eigenvalues of A): { ${poleStr || "none"} }`);

  // Compute zeros (roots of numerator)
  const zeroRoots = computePoles(simplified.num);
  const zeroStr = zeroRoots.map(formatRoot).join(", ");
  derivation.push(`Transmission zeros (roots of numerator): { ${zeroStr || "none"} }`);

  return {
    system: sys,
    tf: simplified,
    charPoly,
    poles,
    zeros: zeroRoots,
    derivation,
    display: { num: format(simplified.num), den: format(simplified.den) },
  };
}

function computePoles(p: Poly): Array<{ re: number; im: number }> {
  const d = degree(p);
  if (d === 0) return [];
  // Use the roots() function from polynomial.ts
  return roots(p);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type SSValidationError = {
  field: "A" | "B" | "C" | "D";
  message: string;
};

export function validateStateSpace(sys: StateSpaceSystem): SSValidationError[] {
  const errors: SSValidationError[] = [];
  const n = sys.A.rows;

  if (sys.A.rows !== sys.A.cols) {
    errors.push({ field: "A", message: "A must be square (n×n)" });
  }
  if (sys.B.rows !== n) {
    errors.push({ field: "B", message: `B must have ${n} rows to match A` });
  }
  if (sys.C.cols !== n) {
    errors.push({ field: "C", message: `C must have ${n} columns to match A` });
  }
  if (sys.D.rows !== sys.C.rows || sys.D.cols !== sys.B.cols) {
    errors.push({ field: "D", message: "D must be q×p (outputs × inputs)" });
  }

  return errors;
}

// ─── Common system presets ────────────────────────────────────────────────────

export type SSPreset = {
  label: string;
  description: string;
  system: StateSpaceSystem;
  expectedTF?: string;
};

export const SS_PRESETS: SSPreset[] = [
  {
    label: "First-Order: G(s) = K/(τs+1)",
    description: "Single integrator with gain. ẋ = -x/τ + Ku, y = x",
    system: {
      A: matMake(1, 1, [[-1]]),
      B: matMake(1, 1, [[1]]),
      C: matMake(1, 1, [[1]]),
      D: matMake(1, 1, [[0]]),
      label: "First-Order Plant",
    },
    expectedTF: "G(s) = 1/(s + 1)",
  },
  {
    label: "Second-Order: ωn² / (s² + 2ζωn·s + ωn²)",
    description: "Standard second-order system with ωn=2, ζ=0.5. Phase-variable canonical form.",
    system: {
      A: matMake(2, 2, [[0, 1], [-4, -2]]),
      B: matMake(2, 1, [[0], [4]]),
      C: matMake(1, 2, [[1, 0]]),
      D: matMake(1, 1, [[0]]),
      label: "2nd-Order (ωn=2, ζ=0.5)",
    },
    expectedTF: "G(s) = 4/(s² + 2s + 4)",
  },
  {
    label: "Double Integrator: 1/s²",
    description: "Pure double integrator. Marginally stable. Used in spacecraft attitude control.",
    system: {
      A: matMake(2, 2, [[0, 1], [0, 0]]),
      B: matMake(2, 1, [[0], [1]]),
      C: matMake(1, 2, [[1, 0]]),
      D: matMake(1, 1, [[0]]),
      label: "Double Integrator",
    },
    expectedTF: "G(s) = 1/s²",
  },
  {
    label: "DC Motor: K_t / [s(Ls+R)(Js+b)]",
    description: "Full DC motor: electrical + mechanical dynamics. n=3.",
    system: {
      A: matMake(3, 3, [[0, 1, 0], [0, -1, 1], [0, -1, -2]]),
      B: matMake(3, 1, [[0], [0], [1]]),
      C: matMake(1, 3, [[1, 0, 0]]),
      D: matMake(1, 1, [[0]]),
      label: "DC Motor (simplified)",
    },
    expectedTF: "G(s) = 1/(s³ + 3s² + 3s + 1) (see derivation)",
  },
  {
    label: "System with Direct Feedthrough (D ≠ 0)",
    description: "First-order system with non-zero D: G(s) = (s+2)/(s+1). Demonstrates D contribution.",
    system: {
      A: matMake(1, 1, [[-1]]),
      B: matMake(1, 1, [[1]]),
      C: matMake(1, 1, [[1]]),
      D: matMake(1, 1, [[1]]),
      label: "With feedthrough",
    },
    expectedTF: "G(s) = (s + 2)/(s + 1)",
  },
];
