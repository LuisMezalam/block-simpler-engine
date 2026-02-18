/**
 * Block Diagram Simplification Identity Library
 * Reference: CSUN ME Chapter 1 (Pages 43-50), Nise, Ogata, Franklin
 */

export type IdentityCategory =
  | "cascade"
  | "parallel"
  | "feedback"
  | "algebraic"
  | "moving"
  | "signal_flow";

export type Identity = {
  id: string;
  name: string;
  category: IdentityCategory;
  description: string;
  formula: string;
  equivalent: string;
  derivation: string[];
  notes: string[];
  warning?: string;
  reference?: string;
};

export const IDENTITIES: Identity[] = [
  {
    id: "series_2",
    name: "Series (Cascade) - Two Blocks",
    category: "cascade",
    description: "Two transfer functions connected in series: output of G1 feeds into G2.",
    formula: "U(s) --> G1(s) --> G2(s) --> C(s)",
    equivalent: "G_eq(s) = G1(s) * G2(s) = [N1*N2] / [D1*D2]",
    derivation: [
      "Z(s) = G1(s) * U(s)",
      "C(s) = G2(s) * Z(s) = G2(s) * G1(s) * U(s)",
      "G_eq(s) = C(s)/U(s) = G1(s) * G2(s)",
      "= [N1(s)/D1(s)] * [N2(s)/D2(s)]",
      "= N1(s)*N2(s) / [D1(s)*D2(s)]",
    ],
    notes: [
      "Poles of G_eq = poles of G1 union poles of G2",
      "Zeros of G_eq = zeros of G1 union zeros of G2",
      "Multiplication is commutative: G1*G2 = G2*G1",
      "Valid only for linear, time-invariant (LTI) systems",
    ],
    reference: "CSUN Ch.1 p.44-45; Nise §5.2",
  },
  {
    id: "series_n",
    name: "Series (Cascade) - N Blocks",
    category: "cascade",
    description: "N transfer functions in series reduce to a single equivalent block.",
    formula: "U(s) --> G1 --> G2 --> ... --> Gn --> C(s)",
    equivalent: "G_eq(s) = prod(Gi(s)) = [prod(Ni(s))] / [prod(Di(s))]",
    derivation: [
      "By induction on the 2-block series identity:",
      "G12 = G1*G2, then G123 = G12*G3, ...",
      "G_eq = G1*G2*...*Gn = [N1*N2*...*Nn] / [D1*D2*...*Dn]",
    ],
    notes: [
      "Degree of G_eq numerator = sum of deg(Ni)",
      "Degree of G_eq denominator = sum of deg(Di)",
      "Poles: union of all individual poles",
      "Zeros: union of all individual zeros",
    ],
    reference: "CSUN Ch.1 p.45; Ogata §3-6",
  },
  {
    id: "parallel_2",
    name: "Parallel Connection - Two Blocks",
    category: "parallel",
    description: "Two blocks share the same input U(s); outputs are summed at a junction.",
    formula: "U(s) --> G1(s) -->+\n         --> G2(s) -->+ --> C(s)",
    equivalent: "G_eq(s) = G1(s) + G2(s) = [N1*D2 + N2*D1] / [D1*D2]",
    derivation: [
      "Z1(s) = G1(s)*U(s)",
      "Z2(s) = G2(s)*U(s)",
      "C(s) = Z1(s) + Z2(s) = [G1(s) + G2(s)]*U(s)",
      "G_eq = N1/D1 + N2/D2 = [N1*D2 + N2*D1] / [D1*D2]",
    ],
    notes: [
      "Poles of G_eq = poles of G1 union poles of G2 (from D1*D2)",
      "Zeros of G_eq are ENTIRELY NEW - solve N1*D2 + N2*D1 = 0",
      "Sign of each path determined by the summing junction sign",
    ],
    reference: "CSUN Ch.1 p.46-47; Nise §5.3",
  },
  {
    id: "parallel_subtraction",
    name: "Parallel with Subtraction",
    category: "parallel",
    description: "Two blocks in parallel where one is subtracted at the summing junction.",
    formula: "U(s) --> G1(s) -->+\n         --> G2(s) -->- --> C(s)",
    equivalent: "G_eq(s) = G1(s) - G2(s) = [N1*D2 - N2*D1] / [D1*D2]",
    derivation: [
      "C(s) = G1(s)*U(s) - G2(s)*U(s) = [G1(s) - G2(s)]*U(s)",
      "G_eq = N1/D1 - N2/D2 = [N1*D2 - N2*D1] / [D1*D2]",
    ],
    notes: [
      "Poles unchanged from parallel addition identity",
      "Zeros change: determined by N1*D2 - N2*D1 = 0",
    ],
    reference: "Ogata §3-6; Franklin §3.2",
  },
  {
    id: "feedback_negative",
    name: "Negative Feedback (Closed-Loop)",
    category: "feedback",
    description: "The fundamental feedback control loop. Output fed back through H(s) and subtracted from reference R(s).",
    formula: "R(s) ->sum-> G(s) -> C(s)\n             ^--- H(s) ---/  (negative)",
    equivalent: "G_eq(s) = G(s) / [1 + G(s)*H(s)] = [N_G*D_H] / [D_G*D_H + N_G*N_H]",
    derivation: [
      "E(s) = R(s) - H(s)*C(s)",
      "C(s) = G(s)*E(s) = G(s)*R(s) - G(s)*H(s)*C(s)",
      "C(s) + G(s)*H(s)*C(s) = G(s)*R(s)",
      "C(s)*[1 + G(s)*H(s)] = G(s)*R(s)",
      "G_eq(s) = G(s) / [1 + G(s)*H(s)]",
      "Substituting G = N_G/D_G, H = N_H/D_H:",
      "G_eq = [N_G*D_H] / [D_G*D_H + N_G*N_H]",
    ],
    notes: [
      "Poles of G_eq are roots of: D_G*D_H + N_G*N_H = 0",
      "This is the CHARACTERISTIC EQUATION of the closed-loop system",
      "These poles are ENTIRELY NEW - NOT the open-loop poles!",
      "Zeros of G_eq = zeros of G(s) (numerator: N_G*D_H)",
      "Loop gain: L(s) = G(s)*H(s)",
      "Sensitivity: S(s) = 1/[1+L(s)], Complementary: T(s) = L(s)/[1+L(s)]",
    ],
    reference: "CSUN Ch.1 p.48-50; Nise §5.4; Ogata §3-7",
  },
  {
    id: "unity_feedback",
    name: "Unity Negative Feedback (H(s) = 1)",
    category: "feedback",
    description: "Special case of negative feedback with H(s) = 1. Most common in basic control design.",
    formula: "R(s) ->sum-> G(s) -> C(s)\n             ^-----------/  (unity)",
    equivalent: "G_eq(s) = G(s) / [1 + G(s)] = N_G / [D_G + N_G]",
    derivation: [
      "Set H(s) = 1 in the general negative feedback formula",
      "G_eq = G(s) / [1 + G(s)*1] = G(s) / [1 + G(s)]",
      "= [N_G/D_G] / [(D_G + N_G)/D_G]",
      "= N_G / [D_G + N_G]",
    ],
    notes: [
      "Characteristic equation: D_G + N_G = 0",
      "Closed-loop poles are NOT open-loop poles",
      "Example: G(s) = K/(s+a) => G_eq = K/(s+a+K)",
      "DC gain (s->0): G_eq(0) = G(0)/[1+G(0)]",
    ],
    reference: "CSUN Ch.1 p.49; Nise §5.4",
  },
  {
    id: "positive_feedback",
    name: "Positive Feedback",
    category: "feedback",
    description: "Feedback where the fed-back signal is ADDED to the reference. Generally destabilizing.",
    formula: "R(s) ->sum-> G(s) -> C(s)\n             ^+-- H(s) ---/  (positive)",
    equivalent: "G_eq(s) = G(s) / [1 - G(s)*H(s)] = [N_G*D_H] / [D_G*D_H - N_G*N_H]",
    derivation: [
      "E(s) = R(s) + H(s)*C(s)  (note: + sign for positive feedback)",
      "C(s) = G(s)*E(s) = G(s)*R(s) + G(s)*H(s)*C(s)",
      "C(s)*[1 - G(s)*H(s)] = G(s)*R(s)",
      "G_eq(s) = G(s) / [1 - G(s)*H(s)]",
      "= [N_G*D_H] / [D_G*D_H - N_G*N_H]",
    ],
    notes: [
      "Characteristic equation: D_G*D_H - N_G*N_H = 0",
      "System is UNSTABLE if any roots have positive real part",
      "Occurs in oscillator circuits and some biological systems",
      "Always verify Routh-Hurwitz stability after computing",
    ],
    warning: "WARNING: Positive feedback can lead to closed-loop instability. Always verify Routh-Hurwitz stability.",
    reference: "Nise §5.4; Franklin §3.2",
  },
  {
    id: "move_pickoff_forward",
    name: "Move Pick-off Point Forward (Past a Block)",
    category: "moving",
    description: "Moving a signal pick-off point downstream past a block G(s) requires dividing the branch by G(s).",
    formula: "Original: -G(s)-+- | Equivalent: -+-G(s)-\n                  |branch             |branch/G(s)",
    equivalent: "Divide the branch signal by G(s) when moving pick-off forward",
    derivation: [
      "Signal after G: Y(s) = G(s)*X(s)",
      "Moving pick-off forward: main signal is now Y(s)",
      "Branch must still carry X(s) = Y(s)/G(s)",
      "Insert 1/G(s) in the branch to get X(s)",
    ],
    notes: [
      "Moving pick-off forward: insert 1/G(s) in branch",
      "Moving pick-off backward: insert G(s) in branch",
      "Always verify signal values are preserved at each node",
    ],
    reference: "Ogata §3-7; Nise Table 5.2",
  },
  {
    id: "move_summing_forward",
    name: "Move Summing Junction Forward (Past a Block)",
    category: "moving",
    description: "Moving a summing junction past a block G(s) in the forward direction.",
    formula: "-G(s)-sum- | -sum-G(s)-\n       ^R(s)    ^R(s)/G(s)",
    equivalent: "Divide the incoming branch by G(s) when moving junction forward",
    derivation: [
      "Original: Y(s) = G(s)*X(s) + R(s)",
      "Moving junction before G: G(s)*[X(s) + R(s)/G(s)]",
      "= G(s)*X(s) + R(s) (equivalent)",
    ],
    notes: [
      "The branch input must be divided by G(s) when moving forward",
      "Moving backward: multiply the branch input by G(s)",
    ],
    reference: "Ogata §3-7; Nise Table 5.2",
  },
  {
    id: "gain_absorption",
    name: "Gain Absorption",
    category: "algebraic",
    description: "A constant gain K can be absorbed into adjacent transfer functions.",
    formula: "G(s)*K = K*G(s) (scalar commutativity)",
    equivalent: "G_eq(s) = K*G(s) = K*N(s)/D(s)",
    derivation: [
      "K is a scalar (constant gain)",
      "G(s)*K = [K*N(s)] / D(s)",
      "Zeros: N(s) = 0 unchanged",
      "Poles: D(s) = 0 unchanged",
    ],
    notes: [
      "Poles and zeros are unaffected by scalar gain",
      "Gain affects root locus and stability margins",
      "DC gain changes by factor K",
    ],
    reference: "Nise §5.2",
  },
  {
    id: "masons_rule",
    name: "Mason's Gain Formula (Signal Flow Graph)",
    category: "signal_flow",
    description: "General formula for computing transfer function from any signal flow graph.",
    formula: "T(s) = [sum_k Pk*Delta_k] / Delta",
    equivalent: "Delta = 1 - sum(L1) + sum(L2) - sum(L3) + ... (graph determinant)",
    derivation: [
      "Pk = gain of the k-th forward path from input to output",
      "Delta = 1 - (sum of all loop gains) + (sum of products of non-touching loop gains) - ...",
      "Delta_k = cofactor of Delta for path k",
      "T(s) = sum_k(Pk*Delta_k) / Delta",
    ],
    notes: [
      "Applicable to any linear signal flow graph",
      "Handles multiple loops and cross-connections systematically",
      "Reduces to simpler identities for serial/parallel/feedback topologies",
      "Non-touching loops: loops sharing no common nodes",
    ],
    reference: "Nise §5.7; Ogata §3-9; Mason (1956)",
  },
  {
    id: "final_value",
    name: "Final Value Theorem",
    category: "algebraic",
    description: "Relates the steady-state (t->inf) value of a signal to its Laplace transform.",
    formula: "lim_{t->inf} y(t) = lim_{s->0} s*Y(s)",
    equivalent: "y_ss = lim_{s->0} s * G_eq(s) * U(s)",
    derivation: [
      "From Laplace differentiation theorem: L{dy/dt} = s*Y(s) - y(0)",
      "Taking s->0: lim_{s->0} s*Y(s) = lim_{t->inf} y(t)",
      "Valid only if all poles of s*Y(s) are in the open left half plane",
    ],
    notes: [
      "NOT valid for unstable systems or undamped oscillations",
      "For unit step U(s) = 1/s: y_ss = lim_{s->0} G_eq(s)",
      "System type (0,1,2) = number of integrators in loop",
    ],
    reference: "Ogata §2-7; Nise §4.5",
  },
  {
    id: "initial_value",
    name: "Initial Value Theorem",
    category: "algebraic",
    description: "Relates the initial (t=0+) value of a signal to its Laplace transform.",
    formula: "lim_{t->0+} y(t) = lim_{s->inf} s*Y(s)",
    equivalent: "y(0+) = lim_{s->inf} s*Y(s)",
    derivation: [
      "From the Laplace differentiation theorem as s->inf:",
      "The integral term approaches 0 as s->inf",
      "Result: lim_{s->inf} s*Y(s) = y(0+)",
    ],
    notes: [
      "Valid if Y(s) has no poles on or right of imaginary axis",
      "For proper systems (deg num < deg den): lim_{s->inf} G(s) = 0",
      "Useful for checking physical consistency of a transfer function",
    ],
    reference: "Ogata §2-7; Franklin §3.1",
  },
];

export const CATEGORY_META: Record<IdentityCategory, { label: string; color: string }> = {
  cascade: { label: "Cascade / Series", color: "primary" },
  parallel: { label: "Parallel", color: "accent" },
  feedback: { label: "Feedback", color: "warning" },
  algebraic: { label: "Algebraic", color: "success" },
  moving: { label: "Block Moving", color: "info" },
  signal_flow: { label: "Signal Flow", color: "info" },
};

export function getIdentitiesByCategory(category: IdentityCategory): Identity[] {
  return IDENTITIES.filter((id) => id.category === category);
}
