/**
 * Type-Safe Block Diagram Solver
 * =================================
 * Operates on TypedTF (exact polynomial arithmetic) rather than raw strings.
 * Implements all 5 canonical simplification identities with full derivation traces.
 *
 * Reference: Nise §5.2-5.7, Ogata §3-6, Franklin §3.2
 */

import {
  Poly, TypedTF, poly, constant, ZERO, ONE,
  add, sub, mul, scale, mulAll, format, simplifyTF,
  degree, roots, formatRoot, isZero, parsePoly, tf,
} from "./polynomial";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionType =
  | "series"
  | "parallel"
  | "feedback_negative"
  | "feedback_positive"
  | "unity_feedback";

export type TypedBlock = {
  id: string;
  label: string;
  /** Exact typed transfer function */
  tf: TypedTF;
  /** Original string expressions (for display) */
  numStr: string;
  denStr: string;
};

export type SolverResult = {
  connectionType: ConnectionType;
  blocks: TypedBlock[];
  feedbackBlock?: TypedBlock;
  /** Simplified equivalent transfer function */
  equivalentTF: TypedTF;
  /** Formula identity applied */
  formula: string;
  /** Step-by-step algebraic derivation */
  derivation: string[];
  /** Formatted strings for display */
  display: { num: string; den: string };
  /** Poles of G_eq (roots of denominator) */
  poles: Array<{ re: number; im: number }>;
  /** Zeros of G_eq (roots of numerator) */
  zeros: Array<{ re: number; im: number }>;
  /** Stability verdict */
  stability: "stable" | "marginally_stable" | "unstable" | "unknown";
  /** Characteristic equation string */
  charEq: string;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function N(b: TypedBlock): Poly { return b.tf.num; }
function D(b: TypedBlock): Poly { return b.tf.den; }
function fmtPoly(p: Poly): string { return format(p); }

/** Wrap with parentheses if the formatted string contains + or - */
function wrapFmt(p: Poly): string {
  const s = fmtPoly(p);
  return (s.includes("+") || s.includes("-") || s.startsWith("-")) && degree(p) > 0
    ? `(${s})` : s;
}

/** Assess stability from pole list */
function assessStability(poles: Array<{ re: number; im: number }>): "stable" | "marginally_stable" | "unstable" | "unknown" {
  if (poles.length === 0) return "stable";
  if (poles.some(p => isNaN(p.re))) return "unknown";
  const maxRe = Math.max(...poles.map(p => p.re));
  if (maxRe > 1e-8) return "unstable";
  if (Math.abs(maxRe) <= 1e-8) return "marginally_stable";
  return "stable";
}

// ─── Identity 1: Series (Cascade) ────────────────────────────────────────────
/**
 * G_eq(s) = G₁(s)·G₂(s)·...·Gₙ(s)
 *         = [N₁N₂...Nₙ] / [D₁D₂...Dₙ]
 */
function solveSeries(blocks: TypedBlock[]): SolverResult {
  if (blocks.length < 2) throw new Error("Series requires at least 2 blocks");

  const derivation: string[] = [
    "IDENTITY: Series (Cascade) Connection",
    "G_eq(s) = G₁(s) · G₂(s) · ... · Gₙ(s)",
    "",
    "Given blocks:",
    ...blocks.map(b => `  ${b.label}(s) = [${b.numStr}] / [${b.denStr}]`),
    "",
    "Intermediate signals: Z₁ = G₁·U, Z₂ = G₂·Z₁, ..., C = Gₙ·Zₙ₋₁",
    "⟹ C(s) = G₁(s)·G₂(s)·...·Gₙ(s)·U(s)",
    "",
    "Numerator = product of all numerators:",
    `  N_eq = ${blocks.map(b => wrapFmt(N(b))).join(" · ")}`,
    "Denominator = product of all denominators:",
    `  D_eq = ${blocks.map(b => wrapFmt(D(b))).join(" · ")}`,
  ];

  const numPoly = mulAll(blocks.map(b => N(b)));
  const denPoly = mulAll(blocks.map(b => D(b)));
  const rawTF: TypedTF = { num: numPoly, den: denPoly };
  const simplified = simplifyTF(rawTF);

  derivation.push("");
  derivation.push(`After multiplication:`);
  derivation.push(`  N_eq(s) = ${fmtPoly(numPoly)}`);
  derivation.push(`  D_eq(s) = ${fmtPoly(denPoly)}`);
  if (!isZero(sub(numPoly, simplified.num)) || !isZero(sub(denPoly, simplified.den))) {
    derivation.push(`After GCD cancellation:`);
    derivation.push(`  G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`);
  } else {
    derivation.push(`G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`);
  }

  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);
  const stability = assessStability(poles);

  derivation.push("");
  derivation.push(`Poles (union of all block poles): { ${poles.map(formatRoot).join(", ") || "none"} }`);
  derivation.push(`Zeros (union of all block zeros): { ${zeros.map(formatRoot).join(", ") || "none"} }`);

  return {
    connectionType: "series",
    blocks,
    equivalentTF: simplified,
    formula: `G_eq = ${blocks.map(b => b.label).join("·")} = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    derivation,
    display: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
    poles,
    zeros,
    stability,
    charEq: `${fmtPoly(simplified.den)} = 0`,
  };
}

// ─── Identity 2: Parallel ─────────────────────────────────────────────────────
/**
 * G_eq(s) = G₁(s) + G₂(s) + ... = [N₁D₂D₃...+ N₂D₁D₃... + ...] / [D₁D₂...Dₙ]
 */
function solveParallel(blocks: TypedBlock[]): SolverResult {
  if (blocks.length < 2) throw new Error("Parallel requires at least 2 blocks");

  const allDens = blocks.map(b => D(b));
  const denPoly = mulAll(allDens);

  // Numerator: for each block i, multiply N_i by product of all other D_j
  const numTerms: Poly[] = blocks.map((b, i) => {
    const otherDens = allDens.filter((_, j) => j !== i);
    const factor = otherDens.length > 0 ? mulAll(otherDens) : ONE;
    return mul(N(b), factor);
  });
  const numPoly = numTerms.reduce((acc, t) => add(acc, t), ZERO);

  const rawTF: TypedTF = { num: numPoly, den: denPoly };
  const simplified = simplifyTF(rawTF);

  const derivation: string[] = [
    "IDENTITY: Parallel Connection",
    "G_eq(s) = G₁(s) + G₂(s) + ... + Gₙ(s)",
    "",
    "Given blocks (same input U(s), outputs summed at junction):",
    ...blocks.map(b => `  ${b.label}(s) = [${b.numStr}] / [${b.denStr}]`),
    "",
    "Common denominator = D₁·D₂·...·Dₙ:",
    `  D_eq = ${fmtPoly(denPoly)}`,
    "",
    "Numerator terms after cross-multiplication:",
    ...blocks.map((b, i) => `  N${i+1}·${allDens.filter((_, j) => j !== i).map(fmtPoly).join("·") || "1"} = ${fmtPoly(numTerms[i])}`),
    "",
    `N_eq = ${numTerms.map(fmtPoly).join(" + ")} = ${fmtPoly(numPoly)}`,
    "",
    `G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    "",
    "⚠️  Zeros of G_eq are ENTIRELY NEW — not a union of individual zeros.",
    `Solve: ${fmtPoly(simplified.num)} = 0 for new zeros.`,
  ];

  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);
  const stability = assessStability(poles);

  derivation.push(`Poles: { ${poles.map(formatRoot).join(", ") || "none"} }`);
  derivation.push(`Zeros (new): { ${zeros.map(formatRoot).join(", ") || "none"} }`);

  return {
    connectionType: "parallel",
    blocks,
    equivalentTF: simplified,
    formula: `G_eq = ${blocks.map(b => b.label).join(" + ")} = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    derivation,
    display: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
    poles,
    zeros,
    stability,
    charEq: `${fmtPoly(simplified.den)} = 0`,
  };
}

// ─── Identity 3: Negative Feedback ───────────────────────────────────────────
/**
 * G_eq(s) = G(s) / [1 + G(s)H(s)]
 *         = [N_G · D_H] / [D_G·D_H + N_G·N_H]
 */
function solveNegativeFeedback(fwd: TypedBlock, fbk: TypedBlock): SolverResult {
  const NG = N(fwd), DG = D(fwd), NH = N(fbk), DH = D(fbk);

  const numPoly = mul(NG, DH);
  const denPoly = add(mul(DG, DH), mul(NG, NH));

  const rawTF: TypedTF = { num: numPoly, den: denPoly };
  const simplified = simplifyTF(rawTF);

  const derivation: string[] = [
    "IDENTITY: Negative Feedback (Closed-Loop)",
    "G_eq(s) = G(s) / [1 + G(s)·H(s)]",
    "",
    `Forward path:  G(s) = [${fwd.numStr}] / [${fwd.denStr}]`,
    `Feedback path: H(s) = [${fbk.numStr}] / [${fbk.denStr}]`,
    "",
    "Derivation from first principles:",
    "  E(s) = R(s) − H(s)·C(s)                    (error signal)",
    "  C(s) = G(s)·E(s)                             (output equation)",
    "  C(s) = G(s)·R(s) − G(s)·H(s)·C(s)",
    "  C(s)·[1 + G(s)·H(s)] = G(s)·R(s)",
    "  G_eq(s) = C(s)/R(s) = G(s)/[1 + G(s)·H(s)]",
    "",
    "Substituting N/D form:  G = N_G/D_G,  H = N_H/D_H",
    "  Numerator   = N_G · D_H",
    `              = ${wrapFmt(NG)} · ${wrapFmt(DH)} = ${fmtPoly(numPoly)}`,
    "  Denominator = D_G·D_H + N_G·N_H  (characteristic equation)",
    `              = ${wrapFmt(DG)}·${wrapFmt(DH)} + ${wrapFmt(NG)}·${wrapFmt(NH)}`,
    `              = ${fmtPoly(denPoly)}`,
    "",
    `G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    "",
    "🔑 Characteristic equation (closed-loop poles):",
    `   ${fmtPoly(denPoly)} = 0`,
    "   Roots are NOT the open-loop poles — they are NEW closed-loop poles.",
    "",
    "Loop gain: L(s) = G(s)·H(s)",
    "Sensitivity: S(s) = 1/[1 + L(s)]",
    "Complementary: T(s) = L(s)/[1 + L(s)]",
  ];

  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);
  const stability = assessStability(poles);

  derivation.push(`Closed-loop poles: { ${poles.map(formatRoot).join(", ") || "none"} }`);
  derivation.push(`Zeros of G_eq: { ${zeros.map(formatRoot).join(", ") || "none"} }`);
  if (stability === "unstable") {
    derivation.push("⚠️ UNSTABLE: At least one closed-loop pole has Re > 0!");
  } else if (stability === "marginally_stable") {
    derivation.push("⚠️ MARGINALLY STABLE: Poles on imaginary axis.");
  }

  return {
    connectionType: "feedback_negative",
    blocks: [fwd],
    feedbackBlock: fbk,
    equivalentTF: simplified,
    formula: `G_eq = G/[1+GH] = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    derivation,
    display: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
    poles,
    zeros,
    stability,
    charEq: `${fmtPoly(denPoly)} = 0`,
  };
}

// ─── Identity 4: Positive Feedback ───────────────────────────────────────────
/**
 * G_eq(s) = G(s) / [1 − G(s)H(s)]
 *         = [N_G · D_H] / [D_G·D_H − N_G·N_H]
 */
function solvePositiveFeedback(fwd: TypedBlock, fbk: TypedBlock): SolverResult {
  const NG = N(fwd), DG = D(fwd), NH = N(fbk), DH = D(fbk);

  const numPoly = mul(NG, DH);
  const denPoly = sub(mul(DG, DH), mul(NG, NH));

  const rawTF: TypedTF = { num: numPoly, den: denPoly };
  const simplified = simplifyTF(rawTF);

  const derivation: string[] = [
    "IDENTITY: Positive Feedback",
    "G_eq(s) = G(s) / [1 − G(s)·H(s)]",
    "",
    `Forward path:  G(s) = [${fwd.numStr}] / [${fwd.denStr}]`,
    `Feedback path: H(s) = [${fbk.numStr}] / [${fbk.denStr}]`,
    "",
    "Derivation:",
    "  E(s) = R(s) + H(s)·C(s)                    (+ sign: positive feedback)",
    "  C(s) = G(s)·E(s)",
    "  C(s)·[1 − G(s)·H(s)] = G(s)·R(s)",
    "  G_eq(s) = G(s)/[1 − G(s)·H(s)]",
    "",
    `Numerator   = N_G·D_H = ${fmtPoly(numPoly)}`,
    `Denominator = D_G·D_H − N_G·N_H = ${fmtPoly(denPoly)}`,
    `G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    "",
    "⚠️ WARNING: Positive feedback often leads to instability.",
    "   Verify Routh-Hurwitz: all coefficients of characteristic polynomial must have same sign.",
    `   Characteristic equation: ${fmtPoly(denPoly)} = 0`,
  ];

  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);
  const stability = assessStability(poles);
  if (stability === "unstable") {
    derivation.push("❌ CONFIRMED UNSTABLE: Pole(s) in right half-plane.");
  }

  return {
    connectionType: "feedback_positive",
    blocks: [fwd],
    feedbackBlock: fbk,
    equivalentTF: simplified,
    formula: `G_eq = G/[1−GH] = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    derivation,
    display: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
    poles,
    zeros,
    stability,
    charEq: `${fmtPoly(denPoly)} = 0`,
  };
}

// ─── Identity 5: Unity Negative Feedback ─────────────────────────────────────
/**
 * H(s) = 1 → G_eq(s) = G(s)/[1 + G(s)] = N_G / [D_G + N_G]
 */
function solveUnityFeedback(fwd: TypedBlock): SolverResult {
  const NG = N(fwd), DG = D(fwd);

  const numPoly = NG;
  const denPoly = add(DG, NG);

  const rawTF: TypedTF = { num: numPoly, den: denPoly };
  const simplified = simplifyTF(rawTF);

  const derivation: string[] = [
    "IDENTITY: Unity Negative Feedback [H(s) = 1]",
    "G_eq(s) = G(s) / [1 + G(s)]",
    "",
    `Forward path:  G(s) = [${fwd.numStr}] / [${fwd.denStr}]`,
    "Feedback path: H(s) = 1  (identity, no sensor dynamics)",
    "",
    "Set H = 1 in general negative feedback formula:",
    "  G_eq = G/[1 + G·1] = G/[1 + G]",
    `       = [${fmtPoly(NG)}/${fmtPoly(DG)}] / [(${fmtPoly(DG)} + ${fmtPoly(NG)})/${fmtPoly(DG)}]`,
    `       = ${fmtPoly(NG)} / [${fmtPoly(DG)} + ${fmtPoly(NG)}]`,
    `       = ${fmtPoly(NG)} / ${fmtPoly(denPoly)}`,
    "",
    `After simplification: G_eq(s) = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    "",
    `Characteristic equation: ${fmtPoly(denPoly)} = 0`,
    "DC gain (s→0): G_eq(0) = G(0)/[1 + G(0)]",
    `             = ${fmtPoly(NG).replace(/s[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, "0")}... (evaluate at s=0)`,
  ];

  const poles = roots(simplified.den);
  const zeros = roots(simplified.num);
  const stability = assessStability(poles);

  derivation.push(`Closed-loop poles: { ${poles.map(formatRoot).join(", ") || "none"} }`);
  derivation.push(`Zeros: { ${zeros.map(formatRoot).join(", ") || "none"} }`);
  if (stability === "unstable") {
    derivation.push("⚠️ UNSTABLE: Pole(s) with Re > 0 detected.");
  }

  return {
    connectionType: "unity_feedback",
    blocks: [fwd],
    equivalentTF: simplified,
    formula: `G_eq = G/[1+G] = [${fmtPoly(simplified.num)}] / [${fmtPoly(simplified.den)}]`,
    derivation,
    display: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
    poles,
    zeros,
    stability,
    charEq: `${fmtPoly(denPoly)} = 0`,
  };
}

// ─── Public Solver API ────────────────────────────────────────────────────────

/**
 * Solve a block diagram configuration.
 * Parses string expressions into typed polynomials, applies the correct identity,
 * and returns a fully-typed SolverResult.
 */
export function solve(
  connectionType: ConnectionType,
  blocks: Array<{ id: string; label: string; numStr: string; denStr: string }>,
  feedbackBlock?: { id: string; label: string; numStr: string; denStr: string }
): SolverResult {
  // Parse all blocks into TypedBlocks
  const typedBlocks: TypedBlock[] = blocks.map(b => ({
    id: b.id,
    label: b.label,
    numStr: b.numStr,
    denStr: b.denStr,
    tf: {
      num: parsePoly(b.numStr),
      den: parsePoly(b.denStr),
    },
  }));

  const typedFeedback: TypedBlock | undefined = feedbackBlock ? {
    id: feedbackBlock.id,
    label: feedbackBlock.label,
    numStr: feedbackBlock.numStr,
    denStr: feedbackBlock.denStr,
    tf: {
      num: parsePoly(feedbackBlock.numStr),
      den: parsePoly(feedbackBlock.denStr),
    },
  } : undefined;

  switch (connectionType) {
    case "series":
      return solveSeries(typedBlocks);
    case "parallel":
      return solveParallel(typedBlocks);
    case "feedback_negative":
      if (!typedFeedback) throw new Error("Negative feedback requires H(s) block");
      return solveNegativeFeedback(typedBlocks[0], typedFeedback);
    case "feedback_positive":
      if (!typedFeedback) throw new Error("Positive feedback requires H(s) block");
      return solvePositiveFeedback(typedBlocks[0], typedFeedback);
    case "unity_feedback":
      return solveUnityFeedback(typedBlocks[0]);
    default:
      throw new Error(`Unknown connection type: ${connectionType}`);
  }
}

/** Stability label and color for display */
export function stabilityLabel(s: SolverResult["stability"]): { label: string; color: string } {
  switch (s) {
    case "stable":            return { label: "STABLE",            color: "text-success" };
    case "marginally_stable": return { label: "MARGINALLY STABLE", color: "text-warning" };
    case "unstable":          return { label: "UNSTABLE",          color: "text-destructive" };
    case "unknown":           return { label: "UNKNOWN",           color: "text-muted-foreground" };
  }
}
