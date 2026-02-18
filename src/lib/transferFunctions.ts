/**
 * Transfer Function Engine
 * Rigorous algebraic simplification of block diagrams.
 * Reference: CSUN Ch.1 Dynamic Systems, Pages 43-50
 */

export type TransferFunction = {
  num: string;
  den: string;
  label?: string;
};

export type ConnectionType = "series" | "parallel" | "feedback_negative" | "feedback_positive";

export type BlockConfig = {
  id: string;
  label: string;
  tf: TransferFunction;
};

export type SimplificationResult = {
  connectionType: ConnectionType | "unity_feedback";
  blocks: BlockConfig[];
  feedbackBlock?: BlockConfig;
  equivalentTF: TransferFunction;
  formula: string;
  derivation: string[];
  poles: string;
  zeros: string;
};

function wrap(s: string): string {
  const trimmed = s.trim();
  if (trimmed.includes("+") || trimmed.includes("-")) {
    return "(" + trimmed + ")";
  }
  return trimmed;
}

/**
 * IDENTITY 1: Series (Cascade) Connection
 * G_eq(s) = G1(s) * G2(s) * ... * Gn(s)
 * = [N1*N2*...*Nn] / [D1*D2*...*Dn]
 */
export function seriesConnection(blocks: BlockConfig[]): SimplificationResult {
  if (blocks.length < 2) throw new Error("Series requires at least 2 blocks");

  const numParts = blocks.map(b => wrap(b.tf.num));
  const denParts = blocks.map(b => wrap(b.tf.den));

  const num = numParts.join(" * ");
  const den = denParts.join(" * ");

  const derivation: string[] = [
    "Given: " + blocks.map(b => b.label + " = " + b.tf.num + " / " + b.tf.den).join(", "),
    "Intermediate signals: Z1(s) = G1(s)*U(s), Z2(s) = G2(s)*Z1(s), ...",
    "C(s) = G1(s)*G2(s)*...*Gn(s)*U(s)",
    "G_eq(s) = C(s)/U(s) = " + num + " / " + den,
    "Poles of G_eq = poles of " + blocks.map(b => b.label).join(" union poles of "),
    "Zeros of G_eq = zeros of " + blocks.map(b => b.label).join(" union zeros of "),
  ];

  return {
    connectionType: "series",
    blocks,
    equivalentTF: { num, den, label: "G_eq(s)" },
    formula: "G_eq(s) = " + blocks.map(b => b.label).join(" * ") + " = [" + num + "] / [" + den + "]",
    derivation,
    poles: "Union of all poles: {poles of " + blocks.map(b => b.label).join(", ") + "}",
    zeros: "Union of all zeros: {zeros of " + blocks.map(b => b.label).join(", ") + "}",
  };
}

/**
 * IDENTITY 2: Parallel Connection
 * G_eq(s) = G1(s) + G2(s) + ... = [N1*D2+N2*D1+...] / [D1*D2*...]
 */
export function parallelConnection(blocks: BlockConfig[]): SimplificationResult {
  if (blocks.length < 2) throw new Error("Parallel requires at least 2 blocks");

  const dens = blocks.map(b => wrap(b.tf.den));
  const allDen = dens.join(" * ");

  const numTerms = blocks.map((b, i) => {
    const otherDens = blocks
      .filter((_, j) => j !== i)
      .map(ob => wrap(ob.tf.den));
    const factor = otherDens.length > 0 ? otherDens.join(" * ") : "1";
    return wrap(b.tf.num) + " * " + factor;
  });

  const num = numTerms.join(" + ");
  const den = allDen;

  const derivation: string[] = [
    "Given: " + blocks.map(b => b.label + " = " + b.tf.num + " / " + b.tf.den).join(", "),
    "Each branch: Zi(s) = Gi(s)*U(s)",
    "Summing junction: C(s) = [G1(s) + G2(s) + ...]*U(s)",
    "G_eq(s) = [" + numTerms.join(" + ") + "] / [" + den + "]",
    "Poles of G_eq = poles of all Gi (product D1*D2*...)",
    "Zeros of G_eq are NEW -- from: " + numTerms.join(" + ") + " = 0",
  ];

  return {
    connectionType: "parallel",
    blocks,
    equivalentTF: { num, den, label: "G_eq(s)" },
    formula: "G_eq(s) = " + blocks.map(b => b.label).join(" + ") + " = [" + num + "] / [" + den + "]",
    derivation,
    poles: "Union of all poles: {poles of " + blocks.map(b => b.label).join(", ") + "}",
    zeros: "New zeros determined by: " + numTerms.join(" + ") + " = 0",
  };
}

/**
 * IDENTITY 3: Negative Feedback
 * G_eq(s) = G(s) / [1 + G(s)*H(s)]
 * = [N_G * D_H] / [D_G*D_H + N_G*N_H]
 */
export function negativeFeedbackConnection(
  forwardBlock: BlockConfig,
  feedbackBlock: BlockConfig
): SimplificationResult {
  const N1 = wrap(forwardBlock.tf.num);
  const D1 = wrap(forwardBlock.tf.den);
  const N2 = wrap(feedbackBlock.tf.num);
  const D2 = wrap(feedbackBlock.tf.den);

  const num = N1 + " * " + D2;
  const den = D1 + " * " + D2 + " + " + N1 + " * " + N2;

  const derivation: string[] = [
    "Forward path: " + forwardBlock.label + "(s) = " + forwardBlock.tf.num + " / " + forwardBlock.tf.den,
    "Feedback path: " + feedbackBlock.label + "(s) = " + feedbackBlock.tf.num + " / " + feedbackBlock.tf.den,
    "Error signal: E(s) = R(s) - " + feedbackBlock.label + "(s)*C(s)",
    "Output: C(s) = " + forwardBlock.label + "(s)*E(s)",
    "Expanding: C(s)*[1 + " + forwardBlock.label + "*" + feedbackBlock.label + "] = " + forwardBlock.label + "*R(s)",
    "G_eq(s) = " + forwardBlock.label + " / [1 + " + forwardBlock.label + "*" + feedbackBlock.label + "]",
    "Substituting N/D form:",
    "G_eq(s) = [" + N1 + "*" + D2 + "] / [" + D1 + "*" + D2 + " + " + N1 + "*" + N2 + "]",
    "Characteristic equation (closed-loop poles): " + D1 + "*" + D2 + " + " + N1 + "*" + N2 + " = 0",
  ];

  return {
    connectionType: "feedback_negative",
    blocks: [forwardBlock],
    feedbackBlock,
    equivalentTF: { num, den, label: "G_eq(s)" },
    formula: "G_eq(s) = " + forwardBlock.label + " / [1 + " + forwardBlock.label + "*" + feedbackBlock.label + "] = [" + num + "] / [" + den + "]",
    derivation,
    poles: "NEW closed-loop poles from: " + D1 + "*" + D2 + " + " + N1 + "*" + N2 + " = 0",
    zeros: "Zeros of G_eq = zeros of " + forwardBlock.label + " (numerator: " + N1 + "*" + D2 + ")",
  };
}

/**
 * IDENTITY 4: Positive Feedback
 * G_eq(s) = G(s) / [1 - G(s)*H(s)]
 * = [N_G * D_H] / [D_G*D_H - N_G*N_H]
 */
export function positiveFeedbackConnection(
  forwardBlock: BlockConfig,
  feedbackBlock: BlockConfig
): SimplificationResult {
  const N1 = wrap(forwardBlock.tf.num);
  const D1 = wrap(forwardBlock.tf.den);
  const N2 = wrap(feedbackBlock.tf.num);
  const D2 = wrap(feedbackBlock.tf.den);

  const num = N1 + " * " + D2;
  const den = D1 + " * " + D2 + " - " + N1 + " * " + N2;

  const derivation: string[] = [
    "Forward: " + forwardBlock.label + " = " + forwardBlock.tf.num + " / " + forwardBlock.tf.den,
    "Feedback: " + feedbackBlock.label + " = " + feedbackBlock.tf.num + " / " + feedbackBlock.tf.den,
    "Error (positive): E(s) = R(s) + " + feedbackBlock.label + "*C(s)",
    "C(s)*[1 - " + forwardBlock.label + "*" + feedbackBlock.label + "] = " + forwardBlock.label + "*R(s)",
    "G_eq(s) = " + forwardBlock.label + " / [1 - " + forwardBlock.label + "*" + feedbackBlock.label + "]",
    "G_eq(s) = [" + N1 + "*" + D2 + "] / [" + D1 + "*" + D2 + " - " + N1 + "*" + N2 + "]",
    "WARNING: Characteristic eq: " + D1 + "*" + D2 + " - " + N1 + "*" + N2 + " = 0",
    "WARNING: Positive feedback may produce unstable closed-loop poles!",
  ];

  return {
    connectionType: "feedback_positive",
    blocks: [forwardBlock],
    feedbackBlock,
    equivalentTF: { num, den, label: "G_eq(s)" },
    formula: "G_eq(s) = " + forwardBlock.label + " / [1 - " + forwardBlock.label + "*" + feedbackBlock.label + "] = [" + num + "] / [" + den + "]",
    derivation,
    poles: "WARNING: NEW closed-loop poles from: " + D1 + "*" + D2 + " - " + N1 + "*" + N2 + " = 0",
    zeros: "Zeros of G_eq include zeros of " + forwardBlock.label,
  };
}

/**
 * IDENTITY 5: Unity Negative Feedback (H(s) = 1)
 * G_eq(s) = G(s) / [1 + G(s)] = N / [D + N]
 */
export function unityNegativeFeedback(forwardBlock: BlockConfig): SimplificationResult {
  const unityBlock: BlockConfig = {
    id: "unity",
    label: "H",
    tf: { num: "1", den: "1", label: "H(s) = 1" },
  };

  const N = wrap(forwardBlock.tf.num);
  const D = wrap(forwardBlock.tf.den);
  const num = N;
  const den = D + " + " + N;

  const derivation: string[] = [
    "Forward: " + forwardBlock.label + " = " + forwardBlock.tf.num + " / " + forwardBlock.tf.den,
    "Unity feedback: H(s) = 1",
    "G_eq(s) = G(s) / [1 + G(s)*1] = G(s) / [1 + G(s)]",
    "= [" + N + " / " + D + "] / [((" + D + ") + (" + N + ")) / " + D + "]",
    "= " + N + " / [" + D + " + " + N + "]",
    "Characteristic equation: " + D + " + " + N + " = 0",
  ];

  return {
    connectionType: "unity_feedback",
    blocks: [forwardBlock],
    feedbackBlock: unityBlock,
    equivalentTF: { num, den, label: "G_eq(s)" },
    formula: "G_eq(s) = G(s) / [1 + G(s)] = [" + N + "] / [" + D + " + " + N + "]",
    derivation,
    poles: "Closed-loop poles from characteristic eq: " + D + " + " + N + " = 0",
    zeros: "Zeros = zeros of G(s): " + N + " = 0",
  };
}

export function simplify(
  connectionType: ConnectionType | "unity_feedback",
  blocks: BlockConfig[],
  feedbackBlock?: BlockConfig
): SimplificationResult {
  switch (connectionType) {
    case "series":
      return seriesConnection(blocks);
    case "parallel":
      return parallelConnection(blocks);
    case "feedback_negative":
      if (!feedbackBlock) throw new Error("Feedback connection requires H(s) block");
      return negativeFeedbackConnection(blocks[0], feedbackBlock);
    case "feedback_positive":
      if (!feedbackBlock) throw new Error("Feedback connection requires H(s) block");
      return positiveFeedbackConnection(blocks[0], feedbackBlock);
    case "unity_feedback":
      return unityNegativeFeedback(blocks[0]);
    default:
      throw new Error("Unknown connection type: " + connectionType);
  }
}
